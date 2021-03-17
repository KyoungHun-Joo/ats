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

  console.log(await rsiCompare1(1,22));
  
}

call();
