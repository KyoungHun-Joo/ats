const CONFIG = require('../config')();
const rp = require('request-promise');
const jwt = require("jsonwebtoken");
const uuidv4 = require("uuid/v4");
const crypto = require('crypto');
const querystring = require("querystring");
const fetch = require('node-fetch');

const sign = require('jsonwebtoken').sign
const queryEncode = require("querystring").encode

const access_key = CONFIG.UPBIT_OPEN_API_ACCESS_KEY
const secret_key = CONFIG.UPBIT_OPEN_API_SECRET_KEY

const server_url = 'https://api.upbit.com'

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
  var cmc_key = year+month+day+hour+min;

  return cmc_key;
}

function UpbitAPI(){
	this.apiUrl = 'https://api.bithumb.com';
	this.api_key = CONFIG.UPBIT_OPEN_API_ACCESS_KEY;
	this.api_secret = CONFIG.UPBIT_OPEN_API_SECRET_KEY;
}

UpbitAPI.prototype.orderInfo = async function(uuid){

  const body = {
    uuid: uuid
  }

  var result = await this.request("/v1/order",body,"GET");
  return result;
}

UpbitAPI.prototype.upbitCoinSet = async function(connection){

  var upRes = await this.marketInfo();
  var insertQuery = "INSERT INTO upbit_coin(market,name) VALUES "
  for(let i=0;i<upRes.length;i++){
    if(upRes[i].market.indexOf("KRW-")>-1){
      insertQuery += "('"+upRes[i].market+"','"+upRes[i].korean_name+"'),";
    }
  }
  insertQuery = insertQuery.slice(0,-1)
  var result = await connection.execute(insertQuery);
}

UpbitAPI.prototype.minInfo = async function(params){

  const options = {method: 'GET', qs: {market: 'KRW-BTC', count: '1'}};

  fetch(url, options)
    .then(res => res.json())
    .then(json => console.log(json))
    .catch(err => console.error('error:' + err));
}
UpbitAPI.prototype.converPrice = async function(price){
  price = Number(price);

  if(0<=price && price<1000){
    price = Math.floor(price);
  }else if(1000<=price && price<100000){
    price = Math.floor(price/10)*10;
  }else if(100000<=price && price<500000){
    price = Math.floor(price/50)*50;
  }else if(500000<=price && price<1000000){
    price = Math.floor(price/100)*100;
  }else if(1000000<=price && price<2000000){
    price = Math.floor(price/500)*500;
  }else if(2000000<=price){
    price = Math.floor(price/1000)*1000;
  }
  return price;
}
UpbitAPI.prototype.trade = async function(tradeType,market,price=null,volume=null){

  const body = {
      market: market,
      side: tradeType,
      volume: Number(volume),
      price: price,
      ord_type: 'limit',
  }
  console.log('body',body)
  var result = await this.request("/v1/orders",body,"POST");

  return result.uuid;

}
UpbitAPI.prototype.cancel = async function(tradeId){

  const body = {
      uuid: tradeId
  }
  console.log('cancel',tradeId)
  var result = await this.request("/v1/order",body,"DELETE");

  return result;

}
UpbitAPI.prototype.useCoinInfo = async function(connection,minutes=1,count=200){
	var cmc_key = getCmcKey();
	const [data, fields] = await connection.execute("SELECT market,weight FROM upbit_coin WHERE useStatus = 1");
	var market = []

	try{

		for(let i=data.length-1; i>=0; i--){
			var result = await this.coinInfo(minutes,data[i].market,count);
			market.push({market:data[i].market,data:result,weight:data[i].weight});
    }

    //await connection.query("INSERT INTO upbit_min_price (cmc_key, market, opening_price,high_price,low_price,trade_price,acc_trade_price,acc_trade_volume) VALUES ('"
		//	+cmc_key+"','"+data[i].market+"','"+Number(result.opening_price)+"','"+Number(result.high_price)+"','"+Number(result.low_price)+"','"+Number(result.trade_price)+"','"+Number(result.candle_acc_trade_price)+"','"+Number(result.candle_acc_trade_volume)+"')")
		return market;
	}catch(e){
		console.log('e',e.message);
		return e.message;
	}

	//const options = {method: 'GET', qs: {market: 'KRW-BTC,KRW-IQ', count: '1'}};
}

UpbitAPI.prototype.insertPrice = async function(connection){
  const [data, fields] = await connection.execute("SELECT market,weight FROM upbit_coin");
	var markets = []

  for(let i=data.length-1; i>=0; i--){
    markets.push(data[i].market);
  }
  return await this.request("/v1/ticker/",{markets:markets},"GET");
}

UpbitAPI.prototype.getTicker = async function(connection){
  const [data, fields] = await connection.execute("SELECT market,weight FROM upbit_coin");
	var markets = []

  for(let i=data.length-1; i>=0; i--){
    markets.push(data[i].market);
  }
  markets = markets.join(",");

  return await this.request("/v1/ticker/",{markets:markets},"GET");
}

UpbitAPI.prototype.coinInfo = async function(minutes,market,count){
  return await this.request("/v1/candles/minutes/"+minutes,{market:market,count:count},"GET");
}

UpbitAPI.prototype.coinPrice = async function(market){
  var coin = await this.coinInfo(1,market,1);
  return coin[0].trade_price;
}

UpbitAPI.prototype.marketInfo = async function(){

  const body = {
  }
	const options = {method: 'GET'};

  return await this.request("/v1/market/all",body,"GET",{isDetails: 'false'});
}


UpbitAPI.prototype.request = async function(apiUrl,body,type,qs={}){
  var result;
  var options;

	try{
		const query = queryEncode(body)
		const hash = crypto.createHash('sha512')
		const queryHash = hash.update(query, 'utf-8').digest('hex')
		const payload = {
				access_key: access_key,
				nonce: uuidv4(),
				query_hash: queryHash,
				query_hash_alg: 'SHA512',
		}

		const token = sign(payload, secret_key)

		if(type=="GET"){
			options = {
				method: "GET",
				url: server_url + apiUrl+"?" + query,
				qs:qs,
				headers: {Authorization: `Bearer ${token}`},
				json: body
			}

		}else if(type=='POST'){

			options = {
				method: "POST",
				url: server_url + apiUrl,
				headers: {Authorization: `Bearer ${token}`},
				json: body
			}

		}else{

			options = {
				method: "DELETE",
				url: server_url + apiUrl+"?" + query,
				headers: {Authorization: `Bearer ${token}`},
				json: body
			}

    }
		result = await rp(options);

	}catch(e){
    console.log('err request',e.message)
		result = e.message;
	}

  return result;
}



module.exports = UpbitAPI;
