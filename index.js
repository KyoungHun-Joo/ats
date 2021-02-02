const rp = require('request-promise');
const api = "/v2/cryptocurrency/quotes/latest";

const requestOptions = {
  method: 'GET',
  uri: 'https://pro-api.coinmarketcap.com'+api,
  qs: {
    'id': '1027'
  },
  headers: {
    'X-CMC_PRO_API_KEY': ''
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
  var month = numberPad(new Date().getMonth());
  var day = numberPad(new Date().getDate()+1);
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

function buy(){
  const buyAmount = (money/nowPrice).toFixed(8);
  
  money -= (buyAmoun*nowPrice);

}

function updateMoney(){

}

function sell(){
  const sellAmount = (money/nowPrice).toFixed(8);
  
  money -= (buyAmoun*nowPrice);

}
//1=buy 전, 2=sell 전
var currentStatus = 1;

function compareRSI(){
  const reverseRSI = inputRSI.values.reverse();
  const compareRSI = inputRSI.values.slice(90);
  const nowRSI     = inputRSI.values[inputRSI.values.length];
  var lowRsiFlag = false;
  
  var updownFlag = false;
  var downMaintenance = true;
  var upMaintenance = false;
  var veryUpMaintenance = false;
  var veryDownMaintenance = false;
  compareRSI.forEach((RSI,index)=>{
    const beforeRSI = compareRSI[index-1];
    if(beforeRSI < RSI){
      updownFlag = true;
    }else{
      updownFlag = false;
    } 

    
    //buy 전 매수 포인트 찾기
    if(currentStatus){
      if(RSI > 30) downMaintenance = false;  
      
    //sell 전 매도 포인트 찾기
    }else{
      if(RSI < 70) upMaintenance = false;  

    }
    if(nowRSI < 33.3){
      buy();
    }
  
    if(nowRSI < 66.6){
      sell();
    }

    //매수 포인트
    //rsi가 30보다 크다가 작아지는 순간
    if(rsi > 30) lowRsiFlag = true
    

    if(lowRsiFlag && rsi>30) buy();

  })

  if(currentStatus){
  }

}

  var mysql_dbc = require('./db_con')();
  var connection = mysql_dbc.init();
  var dbReady = false;

  exports.handler = function(event, context, callback) {
    connection.connect(function(err) {
      if (err) {
        console.error('Database connection failed: ' + err.stack);
        return;
      }

      var cmc_key = getCmcKey();

      return rp(requestOptions).then(response => {

        var data = response.data[1027];
        if(data && data.quote.USD.price){
          var sql = "INSERT INTO price (date_key, cmc_id, slug, name, price)"+
          " VALUES ('"+cmc_key+"', '"+data.id+"', '"+data.slug+"', '"+data.name+"', '"+data.quote.USD.price+"')";

          connection.query(sql, function (err, result) {
            if (err) console.log('qurey err',err);

            connection.end();
            return callback(null, { 'statusCode': 200,
            'headers': {
              "Access-Control-Allow-Origin": "*"
              },
            'body': JSON.stringify(cmc_key) });
          });
        }

      }).catch((err) => {
        console.log('API call error:', err.message);
      });

    });

  }
