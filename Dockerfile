FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

FROM node:22-alpine
WORKDIR /app

RUN apk add --no-cache \
    libaio \
    libnsl \
    libc6-compat \
    gcompat \
    curl \
    unzip

RUN curl -o instantclient.zip \
    -L https://download.oracle.com/otn_software/linux/instantclient/1919000/instantclient-basic-linux.x64-19.19.0.0.0dbru.zip \
    -H "Cookie: oraclelicense=accept" && \
    unzip instantclient.zip && \
    mv instantclient_19_19 /usr/lib/instantclient && \
    rm instantclient.zip

RUN ln -s /usr/lib/instantclient/libclntsh.so.19.1 /usr/lib/libclntsh.so && \
    ln -s /usr/lib/instantclient/libocci.so.19.1 /usr/lib/libocci.so && \
    ln -s /usr/lib/libnsl.so.3 /usr/lib/libnsl.so.1 && \
    ldconfig /usr/lib/instantclient

ENV LD_LIBRARY_PATH=/usr/lib/instantclient
ENV ORACLE_CLIENT=/usr/lib/instantclient

COPY --from=builder /app ./

RUN npm install pm2 -g

EXPOSE 5401

CMD ["pm2-runtime", "ecosystem.config.cjs", "--env", "production"]
