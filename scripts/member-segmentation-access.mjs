// Optional negative-test credentials never determine the authorized identity.
export async function resolveSegmentationDeniedSession({authorized,deniedSessionId,getSession}){
 if(!deniedSessionId?.trim())return {status:'pending',code:'REAL_DENIED_USER_NOT_CONFIGURED'};
 let session;
 try{session=await getSession(deniedSessionId);}catch(error){
  const codes={ORACLE_SESSION_NOT_FOUND:'REAL_DENIED_SESSION_NOT_FOUND',ORACLE_SESSION_NOT_ACTIVE:'REAL_DENIED_SESSION_NOT_ACTIVE',ORACLE_SESSION_EXPIRED:'REAL_DENIED_SESSION_EXPIRED'};
  if(Object.hasOwn(codes,error?.code))return {status:'pending',code:codes[error.code]};
  throw error;
 }
 if(session.username===authorized.username)return {status:'pending',code:'REAL_DENIED_DISTINCT_USER_NOT_PROVIDED'};
 return {status:'ready'};
}
