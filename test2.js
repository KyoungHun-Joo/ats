const mysql_dbc = require('./db_con')();
const RSI = require('technicalindicators').RSI;
const volatility = require('./strategy/volatility')
const lowRsiBuy = require('./strategy/lowRsiBuy')

var connection;
const gap = 2;
const lowPoint = 33.3+gap;
const highPoint = 66.6-gap;

var inputRSI = {
  values:[],
  period : 14
}

async function call(){
  console.log('call in')
  connection = await mysql_dbc.init();

  var buy = false;
  var buyCnt = 0;
  var buyPrice = 0;
  var born = 45000;
  var unit = 0;
  var nowPrice = 0;
  var standardPrice = 0;

  const [priceData, fields] = await connection.execute("SELECT * FROM price2 ORDER BY createdAt DESC LIMIT 3000");


  for(let i=priceData.length-1; i>=0; i--){
    nowPrice = priceData[i].price;
    console.log('rsi',priceData[i].rsi)
    if(standardPrice ==0) standardPrice = nowPrice;
    if(!buy && priceData[i].date_key.toString().substr(-2) == '00'){
      standardPrice = Number(nowPrice);
    }
    console.log(standardPrice,nowPrice)
    if(!buy && nowPrice<standardPrice-(standardPrice*0.0125)){
      console.log('buy')
      const lockAmount = Math.floor((born/priceData[i].price)*1000)/1000;
      born -= Math.floor(lockAmount * priceData[i].price);
      unit = lockAmount;
      buyPrice = priceData[i].price;
      buyCnt++;
      buy = true;    
      console.log('buy after',born,unit,buyPrice,standardPrice-(standardPrice*0.0125))
    }else if(buy && nowPrice>standardPrice+(standardPrice*0.0125)){

      const tradeFee = unit * priceData[i].price * 0.0025;
      buy = false;
      born += ((unit * nowPrice) - tradeFee);
      unit = 0;
      console.log('sell',born,standardPrice+(standardPrice*0.0125))

    }
    
  }

  console.log('born',born,unit,nowPrice)

}

call();
