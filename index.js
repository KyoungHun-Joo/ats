process.env.TZ = 'Asia/Seoul'

const rp = require('request-promise');
const rsiCompare1 = require('./strategy/rsiCompare1')
const upbitCompare = require('./strategy/upbitCompare')

const mysql_dbc = require('./db_con')();
const Bithumb = require('./bithumb');
const UpbitAPI = require('./upbit');

const AWS = require('aws-sdk');
const mailService = require('./email');
const CONFIG = require('./config')();

const bithumb = new Bithumb();
const upbit = new UpbitAPI();
const RSI = require('technicalindicators').RSI;
const gap = 0;
const lowPoint   = CONFIG.LOW_POINT +gap;
const highPoint  = CONFIG.HIGH_POINT-gap;
var connection;
const minLambda = true;
const priceTable = "price2";
const http = require('https');

function numberPad(n) {
    n = n + '';
    return n.length >= 2 ? n : '0' + n;
}

function getCmcKey(){
  var year = new Date().getFullYear() ;
  var month = numberPad(new Date().getMonth()+1);
  var day = numberPad(new Date().getDate());
  var hour = numberPad(new Date().getHours());
  var min = numberPad(new Date().getMinutes());

  var period = 1;

  if(min < 15){
  }else if(min < 30){
    period = 2;
  }else if(min < 45){
    period = 3;
  }else if(min < 60){
    period = 4;
  }
  if(minLambda){
    var cmc_key = year+month+day+hour+min;
  }else{
    var cmc_key = year+month+day+hour+period;
  }

  return cmc_key;
}

async function bithumbCall(type,coinPrice,unit,slug){
  var rgParams = {
    order_currency:slug,
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

async function buy(type,amount,coinPrice,test=false,slug="ETH",platform="bithumb"){

  var lockAmount = Math.floor((amount/coinPrice)*1000)/1000;
  amount -= lockAmount*coinPrice;

  if(amount<0) amount = 0;
  if(test){

    await connection.execute("UPDATE variable SET status=4, slug='"+slug+"' WHERE `key` = '"+type+"'");

    await connection.query("INSERT INTO trade_log (type, price, lockAmount, buysell,buysellPrice,order_id,slug,status) VALUES ('"
    +type+"', '"+amount+"', '"+lockAmount+"', 4,'"+coinPrice+"','','"+slug+"',1)")

  }else{
    if(platform=='upbit'){
      var order_id = await upbit.trade(1,slug,coinPrice);
      console.log('order id',order_id)
      if(order_id){
        await connection.execute("UPDATE variable SET status=2, slug='"+slug+"' WHERE `key` = '"+type+"'");

        await connection.query("INSERT INTO trade_log (type, price, lockAmount, buysell,buysellPrice,order_id,slug) VALUES ('"
        +type+"', '"+amount+"', 0, 1,'"+coinPrice+"','"+order_id+"','"+slug+"')")
      }

    }else{
      var order_id = await bithumbCall('buy',coinPrice,lockAmount,slug);
    }

    if(order_id){
      await connection.execute("UPDATE variable SET status=2, slug='"+slug+"' WHERE `key` = '"+type+"'");

      await connection.query("INSERT INTO trade_log (type, price, lockAmount, buysell,buysellPrice,order_id,slug) VALUES ('"
      +type+"', '"+amount+"', 0, 1,'"+coinPrice+"','"+order_id+"','"+slug+"')")
    }

  }
  return;
}

async function sell(type,lockAmount,coinPrice,test=false,slug="ETH",platform){
  console.log('sell in',type,lockAmount,coinPrice);
  var value = Math.floor(lockAmount*coinPrice);

  const [data, fields] = await connection.execute("SELECT price,fee,buysellPrice,slug FROM trade_log where `type` = '"+type+"' AND `buysell` = 1 ORDER BY createdAt DESC LIMIT 0,1");
  var buysellPrice = data[0].buysellPrice;
  var left = data[0].price - data[0].fee - value;
  if(slug!=data[0].slug) return;

  if(buysellPrice>0 && buysellPrice*1.0225 > coinPrice){
    console.log('buysellPrice not valid',buysellPrice,coinPrice)
    return;
  }
  if(test){

    await connection.execute("UPDATE variable SET value = value + "+value+",status=3, lockAmount = 0 WHERE `key` = '"+type+"'");

    await connection.query("INSERT INTO trade_log (type, price, lockAmount, buysell,buysellPrice, order_id,slug,status) VALUES ('"
    +type+"', '"+value+"', '"+lockAmount+"',2,'"+coinPrice+"','','"+slug+"',1)")

  }else{
    var order_id = await bithumbCall('sell',coinPrice,lockAmount,slug);
    if(order_id){
      await connection.execute("UPDATE variable SET status=1, lockAmount = 0 WHERE `key` = '"+type+"'");

      await connection.query("INSERT INTO trade_log (type, price, lockAmount, buysell,buysellPrice, order_id,slug) VALUES ('"
      +type+"', '"+value+"', '"+lockAmount+"',2,'"+coinPrice+"','"+order_id+"','"+slug+"')")
    }

  }

  return;
}

async function compareRSI1(connection, rsiArr,lastRSI,coinPrice,slug){
  if(minLambda){
    var type = 'money4'
  }else{
    var type = 'money1'
  }

  const [data, fields] = await connection.execute("SELECT value,lockAmount,status FROM variable where `key` = '"+type+"'");

  var money = data[0].value;
  var lockAmount = data[0].lockAmount;
  var status = data[0].status;

  //매수전
  if(status == 3){
    if(await rsiCompare1(1,lastRSI)) await buy(type,money,coinPrice,false,slug)
  //매도전
  }else if(status == 4){
    if(await rsiCompare1(2,lastRSI)) await sell(type,lockAmount,coinPrice,false,slug)
  }
}

//급등락 대비
async function compareRSI2(connection, rsiArr,lastRSI,coinPrice,slug){
  if(minLambda){
    var type = 'money5'
  }else{
    var type = 'money2'
  }
  const [data, fields] = await connection.execute("SELECT value,lockAmount,status,slug FROM variable where `key` = '"+type+"'");
  var money = data[0].value;
  var lockAmount = data[0].lockAmount;
  var status = data[0].status;

  const compareRSI = rsiArr.slice(rsiArr.length-20);

  var turnToHigh = false;
  var turnToLow = false;
  var beforeCompare2;
  var beforeCompare;
  var compare;

  for(let i=0; i<compareRSI.length; i++){
    if(i>2){
      beforeCompare2 = compareRSI[i-2];
      beforeCompare = compareRSI[i-1];
      compare = compareRSI[i];

      if(compare>lowPoint) turnToHigh = false;

      if(beforeCompare2<lowPoint && beforeCompare<lowPoint && lastRSI>beforeCompare) turnToHigh = true;

      if(compare<highPoint) turnToLow = false;

      if(beforeCompare2>highPoint && beforeCompare>highPoint && lastRSI<beforeCompare) turnToLow = true;
    }

  }
  //console.log('compare2',beforeCompare2,beforeCompare,lastRSI);
  //rsi 20 아래로 떨어지면 그냥 구매
  if(lastRSI<17){
    turnToHigh = true;
  }

  // if(lastRSI>85){
  //   turnToLow = true;
  // }


  //매수전
  if(status==3 && turnToHigh){
    await buy(type,money,coinPrice,false,slug)
  //매도전
  }else if(status==4 && turnToLow){
    await sell(type,lockAmount,coinPrice,false,slug)
  }

}

//3시간 RSI 평균값으로 매수,매도 시점 계산
async function compareRSI3(connection, rsiArr,lastRSI,coinPrice,slug){

    const [data, fields] = await connection.execute("SELECT value,lockAmount,status,slug FROM variable where `key` = 'money3'");
    var money = data[0].value;
    var status = data[0].status;

    const compareRSI = rsiArr.slice(-12);
    var totalRSI = 0;
    var totalCnt = 0;
    if(slug != data[0].slug) return;

    for(let i=0; i<compareRSI.length; i++){
      if(compareRSI[i]>0){
        totalRSI += compareRSI[i];
        totalCnt ++;
      }
    }

    const avgRSI = (totalRSI/totalCnt)
    const avgGap = 10;

    //매수전
    if(status==3 && lastRSI <= (avgRSI-avgGap)){
      await buy('money3',money,coinPrice,true,slug)
    //매도전
    }else if(status==4 && lastRSI >= (avgRSI+avgGap)){
      await sell('money3',money,coinPrice,true,slug)
    }
}

//변동성 돌파 전략
async function compareRSI4(connection, priceArr,coinPrice){

  var maxPrice = priceArr[0];
  var minPrice = priceArr[0];
  var term = 60; //1 getHours
  const compareArr = priceArr.slice(-term);

  for(let i=0; i<priceArr.length; i++){
    const currentPrice = priceArr[i];
    if(maxPrice<currentPrice) maxPrice = currentPrice;
    if(minPrice>currentPrice) minPrice = currentPrice;
  }
}

//오래 머무른 거래 만료
async function expire(){

}

async function checkOrder(){

  const [data, fields] = await connection.execute("SELECT * FROM trade_log WHERE status=0 AND order_id != '' ");

  for(let i=0;i<data.length;i++){
    if(!data[i].order_id) return;
    try{
      var result = await bithumb.xcoinApiCall('/info/order_detail', {
        order_currency:data[i].slug,
        order_id:data[i].order_id,
      });
      result = JSON.parse(result)

      var trade_amount =0;
      var trade_fee =0;
      var trade_units =0;


      if(result.data.order_status=="Completed"){
        const [leftValue, fileds] = await connection.execute("SELECT value FROM variable WHERE `key` = '"+data[i].type+"' ");

        for(let j=0; j<result.data.contract.length; j++){
          trade_amount += Number(result.data.contract[j].total);
          trade_fee += Number(result.data.contract[j].fee);
          trade_units += Number(result.data.contract[j].units);
        }

        await connection.execute("UPDATE trade_log SET statusStr = '"+result.data.order_status+"', status =1 ,price='"
        +trade_amount+"',lockAmount='"+trade_units+"',fee='"+trade_fee+"' WHERE `id` = '"+data[i].id+"'");
        //구매완료
        if(result.data.type=='bid'){
          console.log('bid completed',trade_amount,leftValue,trade_fee)
          var bidVal = Number(leftValue[0].value) - trade_amount + trade_fee;
          await connection.execute("UPDATE variable SET status = 4,value='"+bidVal+"',lockAmount = '"+trade_units+"' WHERE `key` = '"+data[i].type+"'");
        }else if(result.data.type=='ask'){
          console.log('ask completed',trade_amount,leftValue,trade_fee)

          trade_amount = trade_amount - trade_fee;
          await connection.execute("UPDATE variable SET status = 3,value = '"+trade_amount+"' WHERE `key` = '"+data[i].type+"'");
        }
        return true;
      }else{
        await connection.execute("UPDATE trade_log SET statusStr = '"+result.data.order_status+"' WHERE `id` = '"+data[i].id+"'");

        return false;
      }
    }catch(e){
      await connection.execute("UPDATE trade_log SET statusStr = '"+e.message+"' WHERE `id` = '"+data[i].id+"'");
    }
  }
}

async function bitumbTrade(){

  var cmc_key = getCmcKey();

  var response = await bithumb.orderBook();

  if(response.status == "0000"){
    var coinDatas = response.data;

    for(let i=0;i<Object.keys(coinDatas).length;i++){
      if(coinArr.includes(Object.keys(coinDatas)[i])){
        inputRSI.values = [];
        inputRSI15.values = [];

        const coinKey = Object.keys(coinDatas)[i];
        const coinPrice = coinDatas[coinKey].bids[0].price

        await connection.query("INSERT INTO "+priceTable+" (date_key, slug, price) VALUES ('"
        +cmc_key+"',  '"+coinKey+"', '"+coinPrice+"')")

        const [priceData, fields] = await connection.execute("SELECT * FROM "+priceTable+" WHERE slug='"+coinKey+"' ORDER BY createdAt DESC LIMIT 1000");
        const compareMin = (new Date().getMinutes())%15;

        for(let i=priceData.length-1; i>=0; i--){
          await inputRSI.values.push(priceData[i].price)
          if(Number(priceData[i].date_key.toString().slice(-2))%15 == compareMin)  await inputRSI15.values.push(priceData[i].price);
        }

        const rsiRes = await RSI.calculate(inputRSI);
        const rsiRes15 = await RSI.calculate(inputRSI15);

        const lastRSI = rsiRes[rsiRes.length-1];
        const lastRSI15 = (rsiRes15[rsiRes15.length-1]>=0)?rsiRes15[rsiRes15.length-1]:0;

        if(lastRSI>0){

          await connection.query("UPDATE "+priceTable+" SET rsi = "+lastRSI+", rsi15 = "+lastRSI15+" WHERE date_key = '"+cmc_key+"' AND slug='"+coinKey+"'");
          await compareRSI1(connection, rsiRes15,lastRSI15,coinPrice,coinKey);
          await compareRSI2(connection, rsiRes15,lastRSI15,coinPrice,coinKey);
          await compareRSI3(connection, rsiRes15,lastRSI15,coinPrice,coinKey);

        }else{
          await connection.query("INSERT INTO log (text) VALUES ('no rsi"+lastRSI+"')");
        }

      }
    }
  }
}

async function upbitTrade(connection){
  const [dbData, fields] = await connection.execute("SELECT value,lockAmount,status,slug,lastPrice FROM variable where `key` = 'upbitMoney1'");
  const valueStatus = dbData[0].status
  const lastPrice = dbData[0].lastPrice
  var market = await upbit.marketInfo();

  const rsiRes = await RSI.calculate(inputRSI);

  if(valueStatus == 3){
    const upbitData = await upbit.useCoinInfo(connection,30,200);

    for(let i=0; i<upbitData.length; i++){

      inputRSI15.values = [];
      const market = upbitData[i].market;
      const priceData = upbitData[i].data;

      for(let j=priceData.length-1; j>=0; j--){
        await inputRSI15.values.push(priceData[j].trade_price)
      }
      const rsiRes15 = await RSI.calculate(inputRSI15);
      const lastRSI15 = (rsiRes15[rsiRes15.length-1]>=0)?rsiRes15[rsiRes15.length-1]:0;
      console.log(slug,lastRSI15)
      if(await upbitCompare(1,lastRSI15,0,0)) await buy(type,0,priceData[0].trade_price,false,slug,"upbit")
    }

  }else{
    if(await upbitCompare(2,lastRSI15,lastPrice,priceData[0].trade_price)) await sell(type,lockAmount,coinPrice,false,slug,"upbit")
  }
}

async function call(event, context, callback) {
  //mailService('test')
  const cmc_key = getCmcKey();
  connection = await mysql_dbc.init();


  var inputRSI = {
    values:[],
    period : 14
  }
  var inputRSI15 = {
    values:[],
    period : 14
  }

  try{
    //await checkOrder();
    //await bitumbTrade();
    await upbitTrade();

    await connection.release();

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

call();
