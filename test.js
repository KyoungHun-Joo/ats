const mysql_dbc = require('./db_con')();
const RSI = require('technicalindicators').RSI;
const volatility = require('./strategy/volatility')
const lowRsiBuy = require('./strategy/lowRsiBuy')
const API_KEY = require('./config')();
const rp = require('request-promise');
var connection;
const gap = 2;
const lowPoint = 33.3+gap;
const highPoint = 66.6-gap;
const Bithumb = require('./bithumb');

const bithumb = new Bithumb();
var inputRSI = {
  values:[],
  period : 14
}

async function call(){
  console.log('call in')
  var result = await bithumb.xcoinApiCall('/info/order_detail', {
    order_currency:'ETH',
    order_id:'C0102000000163863611',
  });
  console.log('result',result);
  return;
  const requestOptions2 = {
    method: 'GET',
    uri: 'https://api.bithumb.com/public/orderbook/ALL_KRW',
    headers: {
      'X-CMC_PRO_API_KEY': API_KEY[0]
    },
    qs: {
      'count': '1'
    },
    json: true,
    gzip: true
  };
  const coinArr = ['BTC','ETH','GRS','XEM','ONG','ADA','EOS'];


  var response = await rp(requestOptions2);
  if(response.status == "0000"){
    var coinDatas = response.data;

    for(let i=0;i<Object.keys(coinDatas).length;i++){
      if(coinArr.includes(Object.keys(coinDatas)[i])){
        const coinKey = Object.keys(coinDatas)[i];
        const coinPrice = coinDatas[coinKey].bids[0].price

        console.log('exiest',coinPrice)
      }
    }
  }

return;
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
