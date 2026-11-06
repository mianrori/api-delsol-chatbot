import { readMaxicambios } from '../../dataSources/exchange/maxicambios.dataSource.js';
export const getMaxicambiosQuote = options => readMaxicambios(options);
