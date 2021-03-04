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
  const [priceData, fields] = await connection.execute("SELECT * FROM price2 ORDER BY createdAt DESC LIMIT 3000");


  for(let i=priceData.length-1; i>=0; i--){
    inputRSI.values.push(priceData[i].price)
    nowPrice = priceData[i].price;
    if(!buy && priceData[i].rsi <=lowPoint){

      const lockAmount = Math.floor((born/priceData[i].price)*1000)/1000;
      born -= lockAmount * priceData[i].price;
      unit = lockAmount;
      buyPrice = priceData[i].price;
      buyCnt++;
      buy = true;
    }

    if(buy && priceData[i].rsi >=highPoint){
      if(buyPrice*1.01 < priceData[i].price){
        const tradeFee = unit * priceData[i].price * 0.0025;
        buy = false;
        born += ((unit * priceData[i].price) - tradeFee);
      }
    }

  }

  const rsiRes = await RSI.calculate(inputRSI);

  const [sell,tradePrice] = await lowRsiBuy(connection,priceData);
return;
  const lastRSI = rsiRes[rsiRes.length-1];
  console.log('lastRSI', lastRSI)
  console.log('buyCnt = ', buyCnt)
  console.log('left = ', born)
  console.log('unit = ', unit)
  console.log('buyPrice = ', buyPrice)
  console.log('nowPrice = ', nowPrice)

}

call();
