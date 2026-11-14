export const ACCESS_DENIED_CODE = "ACCESS_DENIED";
export const ACCESS_DENIED_MESSAGE = "El usuario no tiene permisos para consultar esta información.";
export const isAccessDenied = (error) => error?.code === ACCESS_DENIED_CODE || [942, 1031].includes(Number(error?.errorNum));
export const accessDeniedError = (cause) => Object.assign(new Error(ACCESS_DENIED_MESSAGE, { cause }), {
  code: ACCESS_DENIED_CODE,
  ...(cause?.errorNum != null ? { errorNum: Number(cause.errorNum) } : {}),
});
