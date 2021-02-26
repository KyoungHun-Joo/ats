process.env.TZ = 'Asia/Seoul'

const rp = require('request-promise');
const api = "/v2/cryptocurrency/quotes/latest";
const API_KEY = require('./config')();
const mysql_dbc = require('./db_con')();
const Bithumb = require('./bithumb');
const AWS = require('aws-sdk');
const mailService = require('./email');

const bithumb = new Bithumb();
const RSI = require('technicalindicators').RSI;
const gap = 2;
const lowPoint   = 33.3+gap;
const highPoint  = 66.6-gap;
var connection;

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
  var month = numberPad(new Date().getMonth()+1);
  var day = numberPad(new Date().getDate());
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


async function bithumbCall(type,coinPrice,unit){
  var rgParams = {
    order_currency:'ETH',
    payment_currency:'KRW',
    units:Number(unit),
    price:coinPrice
  };

  if(type=="buy"){
    rgParams['type'] = 'bid';
  }else if(type=='sell'){
    rgParams['type'] = 'ask';
  }
  console.log('bitumb call', rgParams)
  var result = JSON.parse(await bithumb.xcoinApiCall('/trade/place', rgParams));
  await connection.query("INSERT INTO log (text) VALUES ('"+JSON.stringify(result).toString()+"')");

  return (result.status==0000)? result.order_id:"";
}

async function buy(type,amount,coinPrice){
  
  var lockAmount = Math.floor((amount/coinPrice)*1000)/1000;
  amount -= lockAmount*coinPrice;

  if(amount<0) amount = 0;

  var order_id = await bithumbCall('buy',coinPrice,lockAmount);
  console.log('order id',order_id)
  if(order_id){
    await connection.execute("UPDATE variable SET value = "+amount+",status=2 WHERE `key` = '"+type+"'");

    await connection.query("INSERT INTO trade_log (type, price, lockAmount, buysell,buysellPrice,order_id) VALUES ('"
    +type+"', '"+amount+"', 0, 1,'"+coinPrice+"','"+order_id+"')")
  }

  return;
}

async function sell(type,lockAmount,coinPrice){
  console.log('sell in',type,lockAmount,coinPrice);
  var value = Math.floor(lockAmount*coinPrice);

  const [data, fields] = await connection.execute("SELECT buysellPrice FROM trade_log where `type` = '"+type+"' AND `buysell` = 1 ORDER BY createdAt DESC LIMIT 0,1");
  var buysellPrice = data[0].buysellPrice;

  if(buysellPrice>0 && buysellPrice*1.01 > coinPrice) return;

  var order_id = await bithumbCall('sell',coinPrice,lockAmount);
  if(order_id){
    await connection.execute("UPDATE variable SET value = value + "+value+",status=1, lockAmount = 0 WHERE `key` = '"+type+"'");

    await connection.query("INSERT INTO trade_log (type, price, lockAmount, buysell,buysellPrice, order_id) VALUES ('"
    +type+"', '"+value+"', '"+lockAmount+"',2,'"+coinPrice+"','"+order_id+"')")
  }

  return;
}

async function compareRSI1(connection, rsiArr,lastRSI,coinPrice){
  var type = 'money1'

  const [data, fields] = await connection.execute("SELECT value,lockAmount,status FROM variable where `key` = '"+type+"'");

  var money = data[0].value;
  var lockAmount = data[0].lockAmount;
  var status = data[0].status;

  //매수전
  if(status == 3){
    if(lastRSI<=lowPoint)await buy(type,money,coinPrice)
  //매도전
  }else if(status == 4){
    if(lastRSI>=highPoint) await sell(type,lockAmount,coinPrice)
  }
}

async function compareRSI2(connection, rsiArr,lastRSI){

  const [data, fields] = await connection.execute("SELECT value,lockAmount,status FROM variable where `key` = 'money2'");
  var money = data[0].value;
  var status = data[0].status;

  const compareRSI = rsiArr.slice(-5);

  var turnToHigh = false;
  var turnToLow = false;


  for(let i=compareRSI.length-1; i>=0; i--){
    const beforeCompare = compareRSI[i-1];
    const compare = compareRSI[i];

    if(compare>lowPoint) turnToHigh = false;

    if(beforeCompare<lowPoint && compare>lowPoint) turnToHigh = true;

    if(compare<highPoint) turnToLow = false;

    if(beforeCompare>highPoint && compare<highPoint) turnToLow = true;

  }
  
  //매수전
  if(status==3 && turnToHigh){
    await buy('money2',money,coinPrice)
  //매도전
  }else if(status==4 && turnToLow){
    await sell('money2',money,coinPrice)
  }

}


async function checkOrder(){

  const [data, fields] = await connection.execute("SELECT * FROM trade_log WHERE status=0 AND order_id != '' ");

  for(let i=0;i<data.length;i++){

    var result = await bithumb.xcoinApiCall('/info/order_detail', {
      order_currency:'ETH',
      order_id:data[i].order_id,
    });
    result = JSON.parse(result)

    var trade_amount =0;
    var trade_fee =0;
    var trade_units =0;
    console.log('result',result)
    if(result.data.order_status=="Completed"){

      for(let j=0; j<result.data.contract.length; j++){
        trade_amount += Number(result.data.contract[j].total);
        trade_fee += Number(result.data.contract[j].fee);
        trade_units += Number(result.data.contract[j].units);
      }

      await connection.execute("UPDATE trade_log SET statusStr = '"+result.data.order_status+"', status =1 ,price='"
      +trade_amount+"',lockAmount='"+trade_units+"',fee='"+trade_fee+"' WHERE `id` = '"+data[i].id+"'");
      //구매완료
      if(result.data.type=='bid'){
        await connection.execute("UPDATE variable SET status = 4,lockAmount = '"+trade_units+"' WHERE `key` = '"+data[i].type+"'");
      }else if(result.data.type=='ask'){
        await connection.execute("UPDATE variable SET status = 3,value = '"+trade_amount+"' WHERE `key` = '"+data[i].type+"'");
      }
      return true;
    }else{
      await connection.execute("UPDATE trade_log SET statusStr = '"+result.data.order_status+"' WHERE `id` = '"+data[i].id+"'");

      return false;
    }
  
  }


}
async function call(event, context, callback) {
  //mailService('test')

  connection = await mysql_dbc.init();
  var inputRSI = {
    values:[],
    period : 14
  }

  try{
    checkOrder();
        
    const requestOptions2 = {
      method: 'GET',
      uri: 'https://api.bithumb.com/public/orderbook/ETH_KRW',
      headers: {
        'X-CMC_PRO_API_KEY': API_KEY[0]
      },
      json: true,
      gzip: true
    };

    var cmc_key = getCmcKey();
    //var response = await rp(requestOptions);
    // var data = response.data[1027];

    var coinData = await rp(requestOptions2);

    if(coinData && coinData.status=="0000"){
      coinPrice=coinData.data.bids[0].price;
      const ret1 = await connection.query("INSERT INTO price (date_key, cmc_id, slug, name, price) VALUES ('"
      +cmc_key+"', '1027', 'ETH', 'Ethereum', '"+coinPrice+"')")

      const [priceData, fields] = await connection.execute("SELECT * FROM price ORDER BY date_key DESC LIMIT 1000");

      for(let i=priceData.length-1; i>=0; i--) await inputRSI.values.push(priceData[i].price)

      const rsiRes = await RSI.calculate(inputRSI);

      const lastRSI = rsiRes[rsiRes.length-1];
      await connection.query("UPDATE price SET rsi = "+lastRSI+" WHERE date_key = '"+cmc_key+"'")

      await compareRSI1(connection, rsiRes,lastRSI,coinPrice);
      await compareRSI2(connection, rsiRes,lastRSI,coinPrice);

      await connection.release();

    }
    return  { 'statusCode': 200,
    'headers': {
      "Access-Control-Allow-Origin": "*"
      },
    'body': cmc_key };
  }catch(e) {
    console.log(e)
    return { 'statusCode': 400,
    'headers': {
      "Access-Control-Allow-Origin": "*"
      },
    'body':  e.message };
  }

}

async function recall(){
  connection = await mysql_dbc.init();
  var inputRSI = {
    values:[],
    period : 14
  }

  const [priceData, fields] = await connection.execute("SELECT * FROM price ORDER BY date_key DESC");

  for(let i=priceData.length-1; i>=0; i--){
    inputRSI.values.push(priceData[i].price)

    const rsiRes = await RSI.calculate(inputRSI);
    var lastRSI = rsiRes[rsiRes.length-1];
    lastRSI = (lastRSI)? lastRSI:0;
    await connection.query("UPDATE price SET rsi = "+lastRSI+" WHERE date_key = '"+priceData[i].date_key+"'");
  }
}

exports.handler = call;
