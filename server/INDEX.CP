const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const axios = require('axios');

const app = express();

// 미들웨어 설정
app.use(cors());
app.use(express.json());

// SQL Server 연결 설정
const sqlConfig = {
  user: 'sa',
  password: 'T01@#BrvoN',
  server: '192.168.101.22',
  database: 'synovn_2',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true
  }
};

// DB 연결 풀 생성
const pool = new sql.ConnectionPool(sqlConfig);
const poolConnect = pool.connect();

// 초기 DB 연결 확인
poolConnect.then(() => {
  console.log('DB 연결 풀 생성 완료');
}).catch(err => {
  console.error('DB 연결 풀 생성 실패:', err);
});

// 서버 상태 확인 API
app.get('/', async (req, res) => {
  try {
    await poolConnect;
    res.json({
      status: 'ok',
      dbConnection: 'Connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      dbConnection: 'Failed',
      error: error.message
    });
  }
});

// 검색 API
app.post('/api/search', async (req, res) => {
  try {
    const { plant, productOrder, opr, lot } = req.body;
    console.log('검색 요청:', { plant, productOrder, opr, lot });

    if (!plant || !productOrder) {
      return res.status(400).json({
        error: '필수 입력값이 누락되었습니다.'
      });
    }

    await poolConnect;
    const result = await pool.request()
      .input('plant', sql.NVarChar, plant)
      .input('productOrder', sql.NVarChar, productOrder)
      .input('opr', sql.NVarChar, opr)
      .input('lot', sql.NVarChar, lot)
      .query(`
        exec usp_prodt_order_opr_cancel @plant, @productOrder, @opr, @lot
      `);

    res.json(result.recordset);

  } catch (error) {
    console.error('API 오류:', error);
    res.status(500).json({
      error: '데이터 조회 중 오류가 발생했습니다.',
      details: error.message
    });
  }
});

// Delete API 수정
app.post('/api/delete', async (req, res) => {
  try {
    const { plant, inputText } = req.body;
    
    if (!plant || !inputText) {
      throw new Error('필수 파라미터가 누락되었습니다.');
    }

    // plant 값에 따른 설정
    let serviceUrl, workClassName;
    switch(plant) {
      case '11':
        serviceUrl = 'http://192.168.101.22/VN041_Default/Services/PP/P4Z07MA1FL_VN041.asmx';
        workClassName = 'P4Z07MA1FL_VN041';
        break;
      case '12':
        serviceUrl = 'http://192.168.101.22/VN041_Default/Services/PP/P4Z06MA1FL_VN041.asmx';
        workClassName = 'P4Z06MA1FL_VN041';
        break;
      case '21':
        serviceUrl = 'http://192.168.101.22/VN041_Default/Services/PP/P4Z06MA1FL_VN041.asmx';
        workClassName = 'P4Z06MA1FL_VN041';
        break;
      default:
        throw new Error(`유효하지 않은 plant 값입니다: ${plant}`);
    }

    // SOAP XML 생성 - ASP 소스와 동일한 구조로 수정
    const soapXml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <cInterface_Delete xmlns="http://www.unierp.com/">
      <ClientIP>192.168.101.22</ClientIP>
      <Database>SYNOVN_2</Database>
      <InputText>${inputText}</InputText>
      <Currency>USD</Currency>
      <LogMethod>2</LogMethod>
      <LangCd>EN</LangCd>
      <UserID>MES-Interface</UserID>
      <ValidDate>20090207</ValidDate>
      <ValidTime>252000000000</ValidTime>
      <WorkClassName>${workClassName}</WorkClassName>
      <Message></Message>
    </cInterface_Delete>
  </soap:Body>
</soap:Envelope>`;

    console.log('SOAP 요청 데이터:', {
      url: serviceUrl,
      xml: soapXml
    });

    // 실제 요청은 MESTOERPFL_VN041.asmx로 전송
    const actualServiceUrl = 'http://192.168.101.22/VN041_Default/Services/PP/MESTOERPFL_VN041.asmx';

    const response = await axios.post(
      actualServiceUrl,  // 실제 서비스 URL 사용
      soapXml,
      {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': 'http://www.unierp.com/cInterface_Delete'
        },
        timeout: 30000
      }
    );

    // 응답 처리
    if (response.status === 200) {
      console.log('SOAP 응답 성공:', response.data);
      res.json({ 
        success: true, 
        message: '삭제가 완료되었습니다.',
        response: response.data
      });
    } else {
      throw new Error(`SOAP 서버 응답 오류: ${response.status}`);
    }

  } catch (error) {
    console.error('Delete 요청 상세 오류:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    
    // ASP 소스와 유사한 에러 처리
    let errorMessage;
    const status = error.response?.status;
    
    if (status === 404) {
      errorMessage = "존재하지 않는 페이지 입니다.(404)";
    } else if (status === 401) {
      errorMessage = "접근이 금지된 페이지 입니다.(401)";
    } else if (status >= 500 && status <= 600) {
      errorMessage = "내부 서버 오류 입니다.(500)";
    } else if (status === 400) {
      errorMessage = "Bad Request(400)";
    } else {
      errorMessage = "서버가 다운되었거나 올바른 경로가 아닙니다.";
    }

    res.status(status || 500).json({
      success: false,
      error: errorMessage,
      details: error.message
    });
  }
});

// WorkClassName 결정 함수
function getWorkClassName(operation) {
  const classNames = {
    '11': 'P4Z07MA1FL_VN041',
    '12': 'P4Z06MA1FL_VN041'
  };
  return classNames[operation] || '';
}

// 서버 시작
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});

// 프로세스 종료 시 연결 풀 정리
process.on('SIGTERM', async () => {
  await pool.close();
  process.exit(0);
}); 