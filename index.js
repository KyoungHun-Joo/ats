const rp = require('request-promise');
const api = "/v2/cryptocurrency/quotes/latest";
const API_KEY = require('./config')();
const mysql_dbc = require('./db_con')();
const RSI = require('technicalindicators').RSI;
const rowPoint   = 33.3;
const highPoint  = 66.6;
var coinPrice = 0;
const requestOptions = {
  method: 'GET',
  uri: 'https://pro-api.coinmarketcap.com'+api,
  qs: {
    'id': '1027'
  },
  headers: {
    'X-CMC_PRO_API_KEY': API_KEY
  },
  json: true,
  gzip: true
};

function numberPad(n) {
    n = n + '';
    return n.length >= 2 ? n : '0' + n;
}

function getCmcKey(){
  var year = new Date().getFullYear() ;
  var month = numberPad(new Date().getMonth());
  var day = numberPad(new Date().getDate()+1);
  var hour = numberPad(new Date().getHours());
  var hour = numberPad(new Date().getHours());
  var min = new Date().getMinutes();

  var period = 1;

  if(min < 15){
  }else if(min < 30){
    period = 2;
  }else if(min < 45){
    period = 3;
  }else if(min < 60){
    period = 4;
  }
  var cmc_key = year+month+day+hour+period;

  return cmc_key;
}

async function buy(type,amount){
  var lockAmount = (amount/nowPrice).toFixed(8);
  amount -= lockAmount;

  await connection.execute("UPDATE variable SET value = "+amount+", lockAmount = "+lockAmount+",status=2 WHERE `key` = '"+type+"'");

  await connection.query("INSERT INTO price (date_key, cmc_id, slug, name, price) VALUES ('"+cmc_key+"', '"+data.id+"', '"+data.slug+"', '"+data.name+"', '"+data.quote.USD.price+"')")

  return;
}

async function sell(type,lockAmount){
  var value = (lockAmount*nowPrice);

  await connection.execute("UPDATE variable SET value = value + "+amount+", lockAmount = 0,status=1 WHERE `key` = '"+type+"'");
  return;
}

function updateMoney(){

}

async function compareRSI1(connection, rsiArr,lastRSI){
  if(coinPrice == 0) return;
  const [data, fields] = await connection.execute("SELECT value,lockAmount,status FROM variable where `key` = 'money1'");
  var money = data[0].value;
  var lockAmount = data[0].lockAmount;

  var status = data[0].status;

  //매수전
  if(status == 1){
    if(lastRSI<=rowPoint){
      buy('money1',money)
    }

  //매도전
  }else{
    if(lastRSI>=highPoint){
      sell('money1',lockAmount)
    }
  }
  console.log('moneyData',money, status);
}

async function compareRSI2(){
  //1=buy 전, 2=sell 전
  var currentStatus = 1;

  const reverseRSI = inputRSI.values.reverse();
  const compareRSI = inputRSI.values.slice(90);
  const nowRSI     = inputRSI.values[inputRSI.values.length];


  var lowRsiFlag = false;
  var updownFlag = false;

  var downMaintenance = true;
  var upMaintenance = false;

  var veryUpMaintenance = false; //과매수가 유지될경우
  var veryDownMaintenance = false;

  var turnToHign = false;
  var turnToRow  = false;

  compareRSI.forEach((RSI,index)=>{
    const beforeRSI = compareRSI[index-1];
    if(beforeRSI < RSI){
      updownFlag = true;
    }else{
      updownFlag = false;
    }

    //buy 전 매수 포인트 찾기
    if(currentStatus){
      if(RSI > rowPoint) downMaintenance = false;


    //sell 전 매도 포인트 찾기
    }else{
      if(RSI < highPoint) upMaintenance = false;

    }
    if(nowRSI < rowPoint){
      buy();
    }

    if(nowRSI > highPoint){
      sell();
    }

    //매수 포인트
    //rsi가 30보다 크다가 작아지는 순간
    if(rsi > 30) lowRsiFlag = true


    if(lowRsiFlag && rsi>30) buy();

  })

  if(currentStatus){

  }else{
  }

}

async function call(event, context, callback) {
  const connection = await mysql_dbc.init();
  var inputRSI = {
    values:[],
    period : 14
  }

  try{

    var cmc_key = getCmcKey();
    var response = await rp(requestOptions);
    var data = response.data[1027];

    if(data && data.quote.USD.price){
      coinPrice=data.quote.USD.price;
      //await connection.query("INSERT INTO price (date_key, cmc_id, slug, name, price) VALUES ('"+cmc_key+"', '"+data.id+"', '"+data.slug+"', '"+data.name+"', '"+data.quote.USD.price+"')")

      const [priceData, fields] = await connection.execute("SELECT * FROM price ORDER BY date_key DESC LIMIT 100");

      for(let i=0; i<priceData.length; i++){
        inputRSI.values.push(priceData[i].price)
      }

      const rsiRes = RSI.calculate(inputRSI);
      const lastRSI = rsiRes[rsiRes.length-1];

      await compareRSI1(connection, rsiRes,lastRSI,data.quote.USD.price);

      await connection.release();

    }

    return callback(null, { 'statusCode': 200,
    'headers': {
      "Access-Control-Allow-Origin": "*"
      },
    'body': JSON.stringify(cmc_key) });
  }catch(e) {
    console.log('API call error:', e.message);
  }

}

exports.handler = call;

call();
