import http from 'node:http';

export const DEV_ORIGINS=Object.freeze({erp:'http://localhost:5300',chatbot:'http://localhost:5400'});
const paths={erp:new Set(['/delsolerp/api/auth/login','/delsolerp/api/auth/logout']),chatbot:new Set(['/chatbot/api/health','/chatbot/api/bot/chat','/chatbot/api/bot/chat/reset'])};
const messages={DEV_TARGET_REJECTED:'Destino fuera del servidor DEV permitido.',DEV_REDIRECT_REJECTED:'DEV devolvió una redirección no permitida.',DEV_NETWORK_FAILED:'No se pudo conectar con DEV.',DEV_RESPONSE_INVALID:'Respuesta DEV inválida.',DEV_RESPONSE_TOO_LARGE:'Respuesta DEV fuera del límite.',DEV_REQUEST_TIMEOUT:'La petición DEV agotó el tiempo.',ERP_DEV_GUARD_REQUIRED:'Falta la protección de logs del ERP DEV.',ERP_LOGIN_REJECTED:'DEV rechazó las credenciales.',ERP_LOGIN_FAILED:'No se pudo iniciar sesión en DEV.',ERP_SESSION_INVALID:'DEV no devolvió una sesión válida.',DEV_ENVIRONMENT_REQUIRED:'Se requiere el entorno development.',ERP_LOGOUT_FAILED:'No se pudo cerrar una sesión creada por la prueba.',TEST_CREDENTIALS_REQUIRED:'Introduce las dos cuentas de prueba mediante entrada oculta.',DEV_LOGIN_CHECK_FAILED:'Una comprobación del flujo DEV falló.'};
export const safeFailure=code=>{const allowed=Object.hasOwn(messages,code)?code:'DEV_LOGIN_CHECK_FAILED';return Object.assign(new Error(messages[allowed]),{code:allowed});};
export const publicFailure=error=>{const e=safeFailure(error?.code);return {code:e.code,message:e.message};};
export function assertDevTarget(service,path){if(!Object.hasOwn(paths,service)||!paths[service].has(path))throw safeFailure('DEV_TARGET_REJECTED');return new URL(path,DEV_ORIGINS[service]);}

// Pin the socket to IPv4 loopback; no proxy, DNS override or redirect is followed.
export function devRequest(service,path,body){
 const url=assertDevTarget(service,path),payload=body===undefined?null:Buffer.from(JSON.stringify(body));
 return new Promise((resolve,reject)=>{
  let settled=false;const fail=code=>{if(!settled){settled=true;reject(safeFailure(code));}};
  const req=http.request({hostname:'127.0.0.1',port:Number(url.port),path:url.pathname,method:payload?'POST':'GET',headers:payload?{'content-type':'application/json','content-length':payload.length}:{}},res=>{
   if(res.statusCode>=300&&res.statusCode<400){res.resume();fail('DEV_REDIRECT_REJECTED');return;}
   const chunks=[];let size=0;
   res.on('data',chunk=>{size+=chunk.length;if(size>1048576){res.destroy();fail('DEV_RESPONSE_TOO_LARGE');}else chunks.push(chunk);});
   res.on('error',()=>fail('DEV_NETWORK_FAILED'));
   res.on('end',()=>{if(settled)return;try{const json=JSON.parse(Buffer.concat(chunks).toString('utf8'));settled=true;resolve({status:res.statusCode,headers:res.headers,json});}catch{fail('DEV_RESPONSE_INVALID');}});
  });
  req.setTimeout(90000,()=>{req.destroy();fail('DEV_REQUEST_TIMEOUT');});req.on('error',()=>fail('DEV_NETWORK_FAILED'));if(payload)req.write(payload);req.end();
 });
}
export async function probeLoginDev(request=devRequest){
 const response=await request('erp','/delsolerp/api/auth/login',{});
 if(response.json?.env!=='development')throw safeFailure('DEV_ENVIRONMENT_REQUIRED');
 if(response.status!==400||response.headers?.['x-erp-dev-safe-auth-tests']!=='1')throw safeFailure('ERP_DEV_GUARD_REQUIRED');
 const health=await request('chatbot','/chatbot/api/health');
 if(health.status!==200||health.json?.env!=='development'||health.json?.success!==true)throw safeFailure('DEV_ENVIRONMENT_REQUIRED');
 return true;
}
export async function loginDev(credentials,request=devRequest){
 if(typeof credentials?.username!=='string'||!credentials.username.trim()||typeof credentials.password!=='string'||!credentials.password)throw safeFailure('TEST_CREDENTIALS_REQUIRED');
 await probeLoginDev(request);
 const r=await request('erp','/delsolerp/api/auth/login',{username:credentials.username,password:credentials.password});
 if(r.json?.env!=='development')throw safeFailure('DEV_ENVIRONMENT_REQUIRED');
 if(r.status===401||r.status===400)throw safeFailure('ERP_LOGIN_REJECTED');
 if(r.status!==200||r.json?.success!==true)throw safeFailure('ERP_LOGIN_FAILED');
 const sessionId=r.json?.data?.sessionId;
 if(typeof sessionId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(sessionId))throw safeFailure('ERP_SESSION_INVALID');
 return sessionId;
}
export async function logoutDev(sessionId,request=devRequest){
 await probeLoginDev(request);
 const r=await request('erp','/delsolerp/api/auth/logout',{sessionId});
 if(r.status!==200||r.json?.env!=='development'||r.json?.success!==true)throw safeFailure('ERP_LOGOUT_FAILED');
}

