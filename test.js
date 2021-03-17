const mysql_dbc = require('./db_con')();
const RSI = require('technicalindicators').RSI;
const rsiCompare1 = require('./strategy/rsiCompare1')

const volatility = require('./strategy/volatility')
const lowRsiBuy = require('./strategy/lowRsiBuy')
const CONFIG = require('./config')();
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
  connection = await mysql_dbc.init();

  const requestOptions2 = {
    method: 'GET',
    uri: 'https://api.bithumb.com/public/orderbook/ALL_KRW',
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
        inputRSI.values = [];

        const coinKey = Object.keys(coinDatas)[i];

        const [priceData, fields] = await connection.execute("SELECT * FROM price2 WHERE slug='"+coinKey+"' ORDER BY createdAt DESC LIMIT 50");

        for(let i=priceData.length-1; i>=0; i--){
          await inputRSI.values.push(priceData[i].price)
        }

        const rsiRes = await RSI.calculate(inputRSI);

        console.log(rsiRes)
        console.log(rsiRes.slice(-5))

        await connection.release();
      }
    }
  }
  console.log(await rsiCompare1(1,22));
  
}

call();
