const express = require('express');

const app = express();
app.listen(8081, function () {
    console.log('listening on 8081')
});

// mssql 연동 -> 실제 본인의 mssql 값 작성해주면 됩니다.
var mssql = require("mssql");
var dbConfig_user = {
    server: "192.168.101.22",
    database: "synovn_2",
    user: "sa",
    password: "",
    port: 1433,
    options: {      // Setting the TLS ServerName to an IP address is not permitted by RFC 6066. 오류 해결
        encrypt: false,
        trustServerCertificate: true,
    } 
};


mssql.connect(dbConfig_user, function(err){
    if(err){
        return console.error('error : ', err);
    }
    console.log('MSSQL 연결 완료')
});