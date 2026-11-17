import config from '../../../config.js';
import {executeOracleQuery} from '../../database/oracle-query.database.js';
import {oracleSearchText,normalizeSearchText} from '../searchText.sql.js';

export const searchCustomersRepository=async(connection,search)=>{
 const normalizedSearch=normalizeSearchText(search);if(!normalizedSearch)return [];
 const name=oracleSearchText('C.NOMBRE_FANTASIA');
 return executeOracleQuery(connection,`SELECT * FROM (
  SELECT matches.*, COUNT(*) OVER() AS TOTAL_MATCHES,
    SUM(EXACT_MATCH) OVER() AS EXACT_MATCH_COUNT
  FROM (
    SELECT C.COD_CLIENTE,C.NOMBRE_FANTASIA,C.RAZON_SOCIAL,'S' AS CONTRATO_ACTIVO,
      CASE WHEN ${name}=:normalizedSearch THEN 1 ELSE 0 END AS EXACT_MATCH,
      CASE WHEN INSTR(${name},:normalizedSearch)>0 THEN 1 ELSE 0 END AS TEXT_MATCH,
      UTL_MATCH.JARO_WINKLER_SIMILARITY(${name},:normalizedSearch) AS SIMILARITY
    FROM VW_BOT_CLIENTES C
    WHERE EXISTS (SELECT 1 FROM VW_BOT_CONTRATOS_LOCALES CL
      WHERE CL.COD_CLIENTE=C.COD_CLIENTE AND CL.TIP_CONTRATO='CNT' AND CL.ESTADO='A')
  ) matches WHERE TEXT_MATCH=1 OR SIMILARITY>=:minSimilarity
  ORDER BY EXACT_MATCH DESC, TEXT_MATCH DESC, SIMILARITY DESC, COD_CLIENTE
 ) WHERE ROWNUM<=:limit`,{normalizedSearch,minSimilarity:Number(config.minSimilarity||70),limit:Number(config.limitFilter||5)});
};
