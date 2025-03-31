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
    let workClassName;
    switch(plant) {
      case '11':
        workClassName = 'P4Z07MA1FL_VN041';
        break;
      case '12':
        workClassName = 'P4Z07MA1FL_VN041';
        break;
      case '21':
        workClassName = 'P4Z07MA1FL_VN041';
        break;
      default:
        throw new Error(`유효하지 않은 plant 값입니다: ${plant}`);
    }

    // ASP 소스와 동일한 구조 사용
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

    console.log('SOAP 요청 XML:', soapXml);

    // SOAP 요청 전송
    const response = await axios.post(
      'http://192.168.101.22/VN041_Default/Services/PP/MESTOERPFL_VN041.asmx',
      soapXml,
      {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': 'http://www.unierp.com/cInterface_Delete'
        },
        timeout: 60000
      }
    );

    console.log('SOAP 응답 상태:', response.status);
    console.log('SOAP 응답 본문:', response.data);

    // 응답 처리
    if (response.status === 200) {
      res.json({ 
        success: true, 
        message: '삭제가 완료되었습니다.',
        details: {
          plant,
          inputText
        }
      });
    } else {
      throw new Error(`SOAP 서버 응답 오류: ${response.status}`);
    }

  } catch (error) {
    console.error('삭제 요청 오류:', error.message);
    
    res.status(500).json({
      success: false,
      error: '삭제 처리 중 오류가 발생했습니다.',
      details: error.message
    });
  }
});

// 레코드 존재 여부 확인 함수 강화
async function checkRecordExists(plant, product, opr, lot) {
  try {
    const pool = await sql.connect(sqlConfig);
    
    // 실제 테이블 이름과 컬럼명 확인 필요
    const query = `
      SELECT COUNT(*) as count
      FROM P_PRODUCTION_RESULTS
      WHERE PLANT_CD = @plant
        AND PRODT_ORDER_NO = @product
        AND OPR_NO = @opr
        AND EXT1_CD = @lot
        AND DEL_FLG = 'N'
    `;
    
    const result = await pool.request()
      .input('plant', sql.VarChar, plant)
      .input('product', sql.VarChar, product)
      .input('opr', sql.VarChar, opr)
      .input('lot', sql.VarChar, lot)
      .query(query);
    
    const exists = result.recordset[0].count > 0;
    console.log('레코드 확인 결과:', {
      plant, product, opr, lot,
      exists,
      count: result.recordset[0].count
    });
    
    return { exists };
  } catch (error) {
    console.error('레코드 확인 오류:', error);
    // 오류 발생 시 기본적으로 존재한다고 가정
    return { exists: true, error: error.message };
  }
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