import test from 'node:test';
import assert from 'node:assert/strict';
import {currencyCases} from '../scripts/backend-independent-control-values.mjs';
import {currencyFixtures,currencyFixtureQuery,contrastCurrencyFixtures} from '../scripts/pr38-currency-controls.mjs';

test('currency stage excludes the ten unaffected blocks',()=>{
  assert.deepEqual([...currencyCases],['PURCHASES_VS_SALES_INDEPENDENT','COMPARISON_DOLLAR_COLLISION_ORACLE_CTE','AFFECTED_AND_MISSING_POSITIVE_HTTP']);
  assert.equal(currencyCases.has('MEMBER_SOLES_HISTORY'),false);
  assert.equal(currencyCases.has('INVOICE_FILTERS'),false);
});

test('currency CTE harness binds controlled inputs and validates results/presentation through the real service',async()=>{
  let calls=0,checks=0;
  await contrastCurrencyFixtures({check:(ok,code)=>{assert.ok(ok,code);checks++;},query:async(text,binds)=>{
    assert.match(text,/^WITH currency_fixture/);assert.ok(!text.includes('VW_BOT_'));
    assert.ok(!text.includes('DOLARES AMERICANOS'),'fixture values must be bound');
    const expected=currencyFixtureQuery(calls++===1);assert.equal(text,expected.text);assert.deepEqual(binds,expected.binds);
    return currencyFixtures.map((f,i)=>({CASE_ID:binds['id'+i],SALES_DESCRIPTION:binds['sd'+i],SALES_SYMBOL:binds['ss'+i],PURCHASE_DESCRIPTION:binds['pd'+i],PURCHASE_SYMBOL:binds['ps'+i],SALES_AMOUNT:binds['sa'+i],PURCHASE_AMOUNT:binds['pa'+i]})).sort((a,b)=>calls===1?a.CASE_ID.localeCompare(b.CASE_ID)||a.SALES_AMOUNT-b.SALES_AMOUNT:b.CASE_ID.localeCompare(a.CASE_ID)||b.SALES_AMOUNT-a.SALES_AMOUNT);
  }});
  assert.equal(calls,2);assert.ok(checks>20);
});
