process.env.TZ = 'Asia/Seoul'

const rp = require('request-promise');
const api = "/v2/cryptocurrency/quotes/latest";
const API_KEY = require('./config')();
const mysql_dbc = require('./db_con')();
const Bithumb = require('./bithumb');
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
    order_currency:'ETC',
    payment_currency:'KRW',
    units:unit,
    price:coinPrice
  };
  
  if(type=="buy"){
    rgParams['type'] = 'bid';
  }else if(type=='sell'){
    rgParams['type'] = 'ask';    
  }
  console.log('coin api call',rgParams)
  var result = await bithumb.xcoinApiCall('/trade/place', rgParams);
  console.log('coin api result',result)
  return (result.status==0000)? result.order_id:"";
}

async function buy(type,amount,coinPrice){
  var lockAmount = (amount/coinPrice).toFixed(8);
  amount -= lockAmount*coinPrice;
  
  var order_id = await bithumbCall('buy',coinPrice,amount);

  await connection.execute("UPDATE variable SET value = "+amount+",status=2 lockAmount = "+lockAmount+" WHERE `key` = '"+type+"'");

  await connection.query("INSERT INTO trade_log (type, price, lockAmount, buysell,buysellPrice,order_id) VALUES ('"
  +type+"', '"+amount+"', '"+lockAmount+"',1,'"+coinPrice+"','"+order_id+"')")

  return;
}

async function sell(type,lockAmount,coinPrice){
  console.log('call sell',type,lockAmount,coinPrice)
  var value = Math.floor(lockAmount*coinPrice);

  const [data, fields] = await connection.execute("SELECT buysellPrice FROM trade_log where `type` = '"+type+"' AND `buysell` = 1 ORDER BY createdAt DESC LIMIT 0,1");
  var buysellPrice = data[0].buysellPrice;

  if(buysellPrice>0 && buysellPrice*1.01 > coinPrice) return;

  var order_id = await bithumbCall('sell',coinPrice,value);

  await connection.execute("UPDATE variable SET value = value + "+value+",status=1 lockAmount = 0 WHERE `key` = '"+type+"'");

  await connection.query("INSERT INTO trade_log (type, price, lockAmount, buysell,buysellPrice, order_id) VALUES ('"
  +type+"', '"+value+"', '"+lockAmount+"',2,'"+coinPrice+"','"+order_id+"')")
  return;
}

async function compareRSI1(connection, rsiArr,lastRSI,coinPrice){

  const [data, fields] = await connection.execute("SELECT value,lockAmount,status FROM variable where `key` = 'money1'");
  var money = data[0].value;
  var lockAmount = data[0].lockAmount;
  var status = data[0].status;
  
  //매수전
  if(status == 3){
    if(lastRSI<=lowPoint) await buy('money1',money,coinPrice)
  //매도전
  }else if(status == 4){
    if(lastRSI>=highPoint) await sell('money1',lockAmount,coinPrice)
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
  if(status==3 && turnToLow){
    await buy('money2',money,coinPrice)
  //매도전
  }else if(status==4 && turnToHigh){
    await sell('money2',money,coinPrice)
  }

}


async function checkOrder(){

  const [data, fields] = await connection.execute("SELECT * FROM trade_log WHERE status=0 ");
  
  for(let i=0;i<data.length-1;i++){
    
    var result = bithumb.xcoinApiCall('/info/order_detail', {
      order_currency:'ETC',
      order_id:data[i].order_id,
    });
    
    var status = 0;
    var trade_amount =0;
    var trade_fee =0;
    var trade_units =0;
    if(data.length<1) return true;
  
    if(result.data[0].order_status=="Completed"){
      status=1;
  
      for(let i=0; i<result.data[0].contract.length; i++){
        trade_amount += Number(result.data[0].contract[i].total);
        trade_fee += Number(result.data[0].contract[i].fee);
        trade_units += Number(result.data[0].contract[i].units);
      } 
      await connection.execute("UPDATE trade_log SET status = "+status+",price='"
      +trade_amount+"',lockAmount='"+trade_units+"',fee='"+trade_fee+"' WHERE `id` = '"+result.data[0].id+"'");
      //구매완료
      if(result.data[0].type=='bid'){
        await connection.execute("UPDATE variable SET status = 4,lockAmount = '"+trade_units+"' WHERE `type` = '"+data[i].type+"'");
      }else if(result.data[0].type=='ask'){
        await connection.execute("UPDATE variable SET status = 3,value = '"+trade_amount+"' WHERE `type` = '"+data[i].type+"'");
      }
      return true;
    }else{
      await connection.execute("UPDATE trade_log SET status = "+result[0].order_status+" WHERE `id` = '"+result.data[0].id+"'");

      return false;
    }
  }


}
async function call(event, context, callback) {
  connection = await mysql_dbc.init();
  var inputRSI = {
    values:[],
    period : 14
  }

  try{
    checkOrder();

    var cmc_key = getCmcKey();
    var response = await rp(requestOptions);
    var data = response.data[1027];

    if(data && data.quote.KRW.price){
      coinPrice=data.quote.KRW.price;
      const ret1 = await connection.query("INSERT INTO price (date_key, cmc_id, slug, name, price) VALUES ('"+cmc_key+"', '"+data.id+"', '"+data.slug+"', '"+data.name+"', '"+data.quote.KRW.price+"')")

      const [priceData, fields] = await connection.execute("SELECT * FROM price ORDER BY date_key DESC LIMIT 1000");
      
      for(let i=priceData.length-1; i>=0; i--) await inputRSI.values.push(priceData[i].price)

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
