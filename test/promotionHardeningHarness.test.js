import test from 'node:test';
import assert from 'node:assert/strict';
import {oracleSelectFixtureConnection} from '../scripts/check-promotion-hardening-dev.mjs';

test('Oracle fixture adapter provides valid default options and preserves binds, options and driver outcome',async()=>{
 const calls=[],expected={rows:[{TOTAL_ROWS:1}]},binds={documentNumber:'SYNTHETIC'};
 const connection={async execute(sql,actualBinds,options){
  assert.ok(options&&typeof options==='object','Oracle rejects an explicit undefined options argument with NJS-005');
  calls.push({sql,binds:actualBinds,options});return expected;
 }};
 const fixture=oracleSelectFixtureConnection(connection,'SELECT 1 AS ID FROM DUAL');
 assert.equal(await fixture.execute('SELECT COUNT(*) FROM VW_BOT_FACTURAS_PROMO',binds),expected);
 assert.equal(calls[0].binds,binds);assert.deepEqual(calls[0].options,{});
 assert.match(calls[0].sql,/^WITH hardening_fixture AS \(SELECT 1 AS ID FROM DUAL\) SELECT COUNT\(\*\) FROM hardening_fixture$/);
 const options={maxRows:2};await fixture.execute('SELECT * FROM VW_BOT_FACTURAS_PROMO',binds,options);
 assert.equal(calls[1].options,options);
 const error=Object.assign(Error('SYNTHETIC'),{code:'ORA-00942'});
 const denied=oracleSelectFixtureConnection({execute:async()=>{throw error;}},'SELECT 1 FROM DUAL');
 await assert.rejects(denied.execute('SELECT * FROM VW_BOT_FACTURAS_PROMO',binds),e=>e===error);
});
