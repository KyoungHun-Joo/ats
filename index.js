process.env.TZ = 'Asia/Seoul'

const rp = require('request-promise');
const api = "/v2/cryptocurrency/quotes/latest";
const API_KEY = require('./config')();
const mysql_dbc = require('./db_con')();
const Bithumb = require('./bithumb');
const bithumb = new Bithumb();
const RSI = require('technicalindicators').RSI;
const lowPoint   = 33.3;
const highPoint  = 66.6;
var connection;

  var rgParams = {
    order_currency:'BTC',
    payment_currency:'KRW'
  };
  //var result = bithumb.xcoinApiCall('/info/account', rgParams);

const requestOptions = {
  method: 'GET',
  uri: 'https://pro-api.coinmarketcap.com'+api,
  qs: {
    'id': '1027',
    'convert': 'KRW'
  },
  headers: {
    'X-CMC_PRO_API_KEY': API_KEY[0]
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

async function buy(type,amount,coinPrice){
  console.log('buy',type)
  var lockAmount = (amount/coinPrice).toFixed(8);
  amount -= lockAmount;

  await connection.execute("UPDATE variable SET value = "+amount+", lockAmount = "+lockAmount+",status=2 WHERE `key` = '"+type+"'");

  await connection.query("INSERT INTO trade_log (type, price, lockAmount, buysell,buysellPrice) VALUES ('"+type+"', '"+amount+"', '"+lockAmount+"',1,'"+coinPrice+"')")

  return;
}

async function sell(type,lockAmount,coinPrice){
  var value = (lockAmount*coinPrice);
  console.log('sell',type)
  const [data, fields] = await connection.execute("SELECT buycellPrice FROM trade_log where `type` = '"+type+"' AND `buysell` = 1 ORDER BY createdAt DESC LIMIT 0,1");
  var buysellPrice = data[0].buysellPrice;

  if(buysellPrice>0 && buysellPrice*1.1 < amount) return;

  await connection.execute("UPDATE variable SET value = value + "+value+", lockAmount = 0,status=1 WHERE `key` = '"+type+"'");

  await connection.query("INSERT INTO trade_log (type, price, lockAmount, buysell,buysellPrice) VALUES ('"+type+"', '"+value+"', '"+lockAmount+"',2,'"+coinPrice+"')")
  return;
}

function updateMoney(){

}

async function compareRSI1(connection, rsiArr,lastRSI,coinPrice){

  const [data, fields] = await connection.execute("SELECT value,lockAmount,status FROM variable where `key` = 'money1'");
  var money = data[0].value;
  var lockAmount = data[0].lockAmount;
  var status = data[0].status;

  //매수전
  if(status == 1){

    if(lastRSI<=lowPoint){
      await buy('money1',money,coinPrice)
    }

  //매도전
  }else{
    if(lastRSI>=highPoint){
      await sell('money1',lockAmount,coinPrice)
    }
  }
}

async function compareRSI2(connection, rsiArr,lastRSI){

  const [data, fields] = await connection.execute("SELECT value,lockAmount,status FROM variable where `key` = 'money2'");
  var money = data[0].value;
  var lockAmount = data[0].lockAmount;
  var status = data[0].status;

  const compareRSI = rsiArr.slice(-30);

  var turnToHigh = false;
  var turnToLow = false;

  var downMaintenance = true;
  var upMaintenance = false;

  for(let i=1; i<compareRSI; i++){
    const beforeCompare = compareRSI[i-1];
    const compare = compareRSI[i];

    if(compare>lowPoint) turnToHigh = false;

    if(beforeCompare<lowPoint && compare>lowPoint) turnToHigh = true;

    if(compare<HighPoint) turnToLow = false;

    if(beforeCompare<lowPoint && compare>lowPoint) turnToLow = true;

  }

  //매수전
  if(status==1 && turnToHigh){
    await buy('money2',money,coinPrice)

  //매도전
  }else if(status==2 && turnToLow){
    await sell('money2',money,coinPrice)
  }

}

async function call(event, context, callback) {
  connection = await mysql_dbc.init();
  var inputRSI = {
    values:[],
    period : 14
  }

  try{
    var msg = 'test';
    var cmc_key = getCmcKey();
    var response = await rp(requestOptions);
    var data = response.data[1027];

    if(data && data.quote.KRW.price){
      coinPrice=data.quote.KRW.price;
      const ret1 = await connection.query("INSERT INTO price (date_key, cmc_id, slug, name, price) VALUES ('"+cmc_key+"', '"+data.id+"', '"+data.slug+"', '"+data.name+"', '"+data.quote.KRW.price+"')")

      const [priceData, fields] = await connection.execute("SELECT * FROM price ORDER BY date_key DESC LIMIT 1000");

      for(let i=0; i<priceData.length; i++){
        inputRSI.values.push(priceData[i].price)
      }

      const rsiRes = await RSI.calculate(inputRSI);

      const lastRSI = rsiRes[rsiRes.length-1];
      await connection.query("UPDATE price SET rsi = "+lastRSI+" WHERE date_key = '"+cmc_key+"'")

      await compareRSI1(connection, rsiRes,lastRSI,data.quote.KRW.price);
      await compareRSI2(connection, rsiRes,lastRSI,data.quote.KRW.price);

      await connection.release();

    }

    return  { 'statusCode': 200,
    'headers': {
      "Access-Control-Allow-Origin": "*"
      },
    'body': cmc_key };
  }catch(e) {
    console.log('err',e.message)
    return { 'statusCode': 400,
    'headers': {
      "Access-Control-Allow-Origin": "*"
      },
    'body':  e.message };
  }

}

exports.handler = call;
