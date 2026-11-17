import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const sessionId='SYNTHETIC-SESSION-CREDENTIAL',username='SYNTHETIC-ORACLE-USER',secret='SYNTHETIC-PASSWORD';
let closeError,touchError,connectError,callbackError,closed=0,opened=0,logs=[],sessionStatus='ACTIVE',expired=false;
const context=vm.createContext({Date,Error,String,Number,console:{error:(...args)=>logs.push(args)}});
const exportsByPath={
 'node:crypto':{randomUUID},
 '../../database/oracle.database.js':{connectWithProxy:async user=>{assert.equal(user,username);if(connectError)throw connectError;opened++;return {close:async()=>{closed++;if(closeError)throw closeError;}};}},
 '../requestContext.service.js':{throwIfRequestAborted:()=>{}},
 '../../repositories/sessions/oracleSession.repository.js':{getOracleSessionRepository:async id=>{assert.equal(id,sessionId);return {session_id:sessionId,username,status:sessionStatus,expires_at:expired?new Date(0):new Date('2999-01-01T00:00:00Z')};},touchOracleSessionRepository:async id=>{assert.equal(id,sessionId);if(touchError)throw touchError;}},
};
const source=new vm.SourceTextModule(await readFile(new URL('../../src/services/sessions/oracleSession.service.js',import.meta.url),'utf8'),{context});
await source.link(spec=>{const values=exportsByPath[spec];assert.ok(values,'Unexpected dependency');return new vm.SyntheticModule(Object.keys(values),function(){for(const [key,value] of Object.entries(values))this.setExport(key,value);},{context});});await source.evaluate();
const run=source.namespace.withOracleProxySession;
const reset=()=>{closeError=touchError=connectError=callbackError=undefined;closed=opened=0;logs=[];sessionStatus='ACTIVE';expired=false;};
const assertPrivate=(expectedCode)=>{
 assert.equal(logs.length,1);assert.equal(logs[0].length,1);
 const log=JSON.parse(JSON.stringify(logs[0][0]));assert.deepEqual(Object.keys(log).sort(),['code','correlationId','driverCode']);
 assert.equal(log.code,'ORACLE_PROXY_CLOSE_FAILED');assert.equal(log.driverCode,expectedCode);
 assert.match(log.correlationId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
 for(const value of [sessionId,username,secret,'SYNTHETIC-DOCUMENT','SYNTHETIC-ERROR-MESSAGE','SYNTHETIC-STACK'])assert.ok(!JSON.stringify(logs).includes(value));
 return log.correlationId;
};
reset();assert.equal(await run(sessionId,async()=>7),7);assert.equal(opened,1);assert.equal(closed,1);assert.equal(logs.length,0);
const correlations=[];
for(const [code,errorNum,expected] of [['ORA-03113',3113,'ORA-03113'],['NJS-500',undefined,'NJS-500'],['DPI-1010',undefined,'DPI-1010'],['INVALID '+secret,3114,'ORA-03114'],['ORA-03113\n'+sessionId,undefined,'ORACLE_CLOSE_ERROR_UNCLASSIFIED'],[undefined,Infinity,'ORACLE_CLOSE_ERROR_UNCLASSIFIED'],[undefined,-1,'ORACLE_CLOSE_ERROR_UNCLASSIFIED']]){
 reset();closeError=Object.assign(Error('SYNTHETIC-ERROR-MESSAGE '+secret),{code,errorNum,stack:'SYNTHETIC-STACK',sessionId,username,documentNumber:'SYNTHETIC-DOCUMENT'});
 assert.equal(await run(sessionId,async()=>9),9);assert.equal(closed,1);correlations.push(assertPrivate(expected));
}
assert.equal(new Set(correlations).size,correlations.length);
reset();closeError=Object.assign(Error(secret),{code:'ORA-03113'});callbackError=Object.assign(Error('primary callback'),{code:'ACCESS_DENIED'});
await assert.rejects(run(sessionId,async()=>{throw callbackError;}),error=>error===callbackError);assert.equal(closed,1);assertPrivate('ORA-03113');
reset();touchError=Error('primary touch');closeError=Object.assign(Error(secret),{errorNum:3113});let callbackReached=false;
await assert.rejects(run(sessionId,async()=>{callbackReached=true;}),error=>error===touchError);assert.equal(callbackReached,false);assert.equal(closed,1);assertPrivate('ORA-03113');
reset();touchError=Error('primary touch');await assert.rejects(run(sessionId,async()=>assert.fail('No callback')),error=>error===touchError);assert.equal(closed,1);assert.equal(logs.length,0);
reset();connectError=Error('connection failure');await assert.rejects(run(sessionId,async()=>assert.fail('No callback')),error=>error===connectError);assert.equal(closed,0);assert.equal(logs.length,0);
reset();expired=true;await assert.rejects(run(sessionId,async()=>assert.fail('No callback')),error=>error.code==='ORACLE_SESSION_EXPIRED');assert.equal(opened,0);assert.equal(logs.length,0);
reset();sessionStatus='INACTIVE';await assert.rejects(run(sessionId,async()=>assert.fail('No callback')),error=>error.code==='ORACLE_SESSION_NOT_ACTIVE');assert.equal(opened,0);assert.equal(logs.length,0);
console.log('Oracle close privacy tests passed');
