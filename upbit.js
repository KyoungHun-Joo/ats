const CONFIG = require('./config')();
const rp = require('request-promise');
const jwt = require("jsonwebtoken");
const uuidv4 = require("uuid/v4");
const crypto = require('crypto');
const querystring = require("querystring");
const fetch = require('node-fetch');

const sign = require('jsonwebtoken').sign
const access_key = CONFIG.UPBIT_OPEN_API_ACCESS_KEY
const secret_key = CONFIG.UPBIT_OPEN_API_SECRET_KEY
const server_url = CONFIG.UPBIT_OPEN_API_SERVER_URL

const url = 'https://api.upbit.com/v1/candles/minutes/1';

function UpbitAPI(){
	this.apiUrl = 'https://api.bithumb.com';
	this.api_key = CONFIG.BITHUMB_KEY;
	this.api_secret = CONFIG.BITHUMB_SECRET;
}

UpbitAPI.prototype.minInfo = async function(params){

  const options = {method: 'GET', qs: {market: 'KRW-BTC', count: '1'}};

  fetch(url, options)
    .then(res => res.json())
    .then(json => console.log(json))
    .catch(err => console.error('error:' + err));
    
}

UpbitAPI.prototype.buy = async function(params){

  const body = {
      market: 'KRW-BTC',
      side: 'bid',
      volume: '0.01',
      price: '100',
      ord_type: 'limit',
  }

  return await this.request("/v1/orders",body,"POST");

}

UpbitAPI.prototype.info = async function(params){

  const body = {
      market: 'KRW-BTC'
  }

  return await this.request("/v1/orders/chance",body,"GET");
}

UpbitAPI.prototype.request = async function(apiUrl,body,type){
  var result;
  var options;
  const query = queryEncode(body)

  const hash = crypto.createHash('sha512')

  const query = queryEncode(body)
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
      headers: {Authorization: `Bearer ${token}`},
      json: body
    }

  }else{

    options = {
      method: "POST",
      url: server_url + apiUrl,
      headers: {Authorization: `Bearer ${token}`},
      json: body
    }

  }

  try{
    result = await rp();
  }catch(e){
    result = e.message
  }

  return result;
}



module.exports = XCoinAPI;
