
//priceArr == 최근 1000개 데이터
async function strategy(connection, priceArr, term=60){
  var tradePrice = 0;
  var result = false;
  var maxPrice = 0;
  var minPrice = 0;
  var range = 0;
  var startPrice = 0; //시가
  var beforeHour = numberPad(new Date().getHours()-1);
  var hour = numberPad(new Date().getHours());
  var min = numberPad(new Date().getMinutes());

  var [data, fields] = await connection.execute("SELECT value,lockAmount FROM variable where `key` = 'volatility'");
  data = data[0];

  if(Number(data.value) != hour || Number(data.lockAmount) == 0 || min==00){

    var year = new Date().getFullYear() ;
    var month = numberPad(new Date().getMonth()+1);
    var day = numberPad(new Date().getDate());
    
    const compareKey = year+month+day+beforeHour;
    const currentKey = year+month+day+hour+'00';

    const compareArr = priceArr.slice(0,60);

    for(let i=compareArr.length-1; i>=0; i--){

      if(compareArr[i].date_key.toString().substring(0,10)== compareKey){
        
        const currentPrice = Number(compareArr[i].price);
        if(maxPrice==0) maxPrice = currentPrice;
        if(minPrice==0) minPrice = currentPrice;
    
        if(maxPrice<currentPrice) maxPrice = currentPrice;
        if(minPrice>currentPrice) minPrice = currentPrice;
      }

      if(compareArr[i].date_key.toString()== currentKey) startPrice = compareArr[i].price; 

    } 
    
    range = maxPrice - minPrice;
    tradePrice = Number(startPrice) + (range * 0.5)
    await connection.execute("UPDATE variable SET value = "+hour+",lockAmount="+tradePrice+" WHERE `key` = 'volatility'");
    return [result,tradePrice];

  }else{
    
    return 'test';
  }
  

}

function numberPad(n) {
  n = n + '';
  return n.length >= 2 ? n : '0' + n;
}

async function initValue(){

}

async function test(priceArr){

  var testKey = "";
  var testAmount = 100000;
  
  var testLockAmount = 0;
  var testLockUnit = 0;
  var testTradeAmount = 0;
  var testRange = 0;
  
  var testBuyCnt = 0;
  var currentPrice = 0;
  for(let i=priceArr.length-1; i>=0; i--){
    console.log(priceArr[i].date_key,testTradeAmount);
    currentPrice = Number(priceArr[i].price);
    if(testKey == "") testKey = priceArr[i].date_key.toString().substring(0,10);

    const minute = priceArr[i].date_key.toString().substring(10);

    if(testLockUnit==0 && testTradeAmount>0 && testTradeAmount<currentPrice){

      const lockAmount = Math.floor((testAmount/currentPrice)*1000)/1000;
      testAmount -= lockAmount * currentPrice;
      testLockUnit = lockAmount;
      console.log('buy',testAmount,testLockUnit,testLockUnit*currentPrice)

      testBuyCnt++;

    }

    
    if(minute == '59'){
      console.log('sell',testAmount,testLockUnit,currentPrice)

      const tradeFee = testLockUnit * currentPrice * 0.0025;
      testAmount += ((testLockUnit * currentPrice) - tradeFee);  
      testLockUnit = 0;
    }else if(minute == '00' || minute == '0'){
      var maxPrice = 0;
      var minPrice = 0;
      for(let j=i+60; j>i; j--){
        if(priceArr[j]){
          if(priceArr[j].date_key.toString().substring(0,10)== testKey){
          
            const currentPrice = Number(priceArr[j].price);
            if(maxPrice==0) maxPrice = currentPrice;
            if(minPrice==0) minPrice = currentPrice;
        
            if(maxPrice<currentPrice) maxPrice = currentPrice;
            if(minPrice>currentPrice) minPrice = currentPrice;
          }

          testRange = maxPrice - minPrice;
          testTradeAmount = currentPrice + (testRange * 0.5);
        }
      }
      
      testKey = priceArr[i].date_key.toString().substring(0,10);
      console.log('testTradeAmount',testTradeAmount,testKey);

    }
  } 

  console.log('ttest end',testAmount,testLockUnit,currentPrice)

}
module.exports = strategy;
