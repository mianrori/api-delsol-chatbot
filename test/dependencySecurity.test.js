import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import ExcelJS from "exceljs";

const require = createRequire(import.meta.url);
const excelRequire = createRequire(require.resolve("exceljs/package.json"));
const expressRequire = createRequire(require.resolve("express/package.json"));

test("ExcelJS's CommonJS UUID dependency keeps v4 and rejects undersized v3/v5 buffers", () => {
  const { v4, v3, v5, validate } = excelRequire("uuid");
  assert.equal(validate(v4()), true);
  for (const generate of [v3, v5]) {
    assert.throws(() => generate("synthetic", v5.DNS, new Uint8Array(8), 4), RangeError);
  }
});

test("ExcelJS writes and reopens XLSX including the extended conditional-format UUID path", async () => {
  const workbook = new ExcelJS.Workbook();
  const sales = workbook.addWorksheet("Ventas");
  sales.columns = [{ header: "Local", key: "local", width: 20 }, { header: "Importe total", key: "amount", width: 20 }];
  sales.addRows([{ local: "Synthetic A", amount: 1234.5 }, { local: "Synthetic B", amount: -25 }]);
  sales.getColumn("amount").numFmt = "#,##0.00";
  sales.views = [{ state: "frozen", ySplit: 1 }];
  sales.addConditionalFormatting({ ref: "B2:B3", rules: [{ type: "iconSet", iconSet: "3Stars", cfvo: [
    { type: "percent", value: 0 }, { type: "percent", value: 33 }, { type: "percent", value: 67 },
  ] }] });
  workbook.addWorksheet("Información").addRows([["Moneda", "PYG"], ["Registros exportados", 2]]);
  const bytes = await workbook.xlsx.writeBuffer();
  assert.equal(Buffer.from(bytes).subarray(0, 2).toString(), "PK");
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(bytes);
  assert.equal(restored.getWorksheet("Ventas").getCell("B2").value, 1234.5);
  assert.equal(restored.getWorksheet("Ventas").getCell("B3").value, -25);
  assert.equal(restored.getWorksheet("Información").getCell("B1").value, "PYG");
  assert.equal(restored.getWorksheet("Ventas").conditionalFormattings[0].rules[0].iconSet, "3Stars");
});

test("Express's qs dependency handles hostile comma-array stringification without throwing", () => {
  const qs = expressRequire("qs");
  for (const encodeValuesOnly of [false, true]) {
    assert.doesNotThrow(() => qs.stringify({ a: [{ toString: "x" }] }, { arrayFormat: "comma", encodeValuesOnly }));
  }
  assert.deepEqual(qs.parse("filters[month]=01&filters[tags][]=a&filters[tags][]=b"), { filters: { month: "01", tags: ["a", "b"] } });
});

test("compressed JSON and forms still parse and malformed compressed requests do not kill the worker", () => {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import assert from 'node:assert/strict';
    import express from 'express';
    import { gzipSync } from 'node:zlib';
    const app=express();
    app.use(express.json({limit:'10mb'}));
    app.use(express.urlencoded({limit:'10mb',extended:true}));
    app.post('/echo',(req,res)=>res.json(req.body));
    app.get('/alive',(_req,res)=>res.json({alive:true}));
    app.use((error,_req,res,_next)=>res.status(error.status??500).json({error:true}));
    const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    try{
      const base='http://127.0.0.1:'+server.address().port;
      const post=(body,type,compressed=false)=>fetch(base+'/echo',{method:'POST',headers:{'content-type':type,...(compressed?{'content-encoding':'gzip'}:{})},body,signal:AbortSignal.timeout(3000)});
      assert.deepEqual(await (await post(gzipSync('{"message":"synthetic"}'),'application/json',true)).json(),{message:'synthetic'});
      assert.deepEqual(await (await post('filters[month]=01&tags[]=a&tags[]=b','application/x-www-form-urlencoded')).json(),{filters:{month:'01'},tags:['a','b']});
      for(const type of ['application/json','application/x-www-form-urlencoded']){
        const input=type==='application/json'?'{}':'a=b';
        const response=await post(Buffer.concat([gzipSync(input),Buffer.from([255,0,255,0])]),type,true);
        assert.ok([200,400].includes(response.status));
        await response.arrayBuffer();
        await new Promise(resolve=>setTimeout(resolve,50));
        assert.equal((await fetch(base+'/alive')).status,200);
      }
      const invalid=await post(Buffer.from('invalid gzip'),'application/json',true);
      assert.equal(invalid.status,400);
      assert.equal((await fetch(base+'/alive')).status,200);
    }finally{await new Promise(resolve=>server.close(resolve));}
  `], { encoding: "utf8", timeout: 15000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
