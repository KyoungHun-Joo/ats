const CONFIG = require('../config')();

//buySell = 1 -> 구매여부
//buySell = 2 -> 판매매여부
async function strategy(buySell, lastRSI,lastPrice, price,weight=0){

  //매수전
  if(buySell == 1){
    if(lastRSI<=CONFIG.LOW_POINT-weight){
      return true;
    }else{
      return false;
    }
  //매도전
  }else if(buySell == 2){
    if(lastPrice*1.01<price){
      return true;
    }else{
      return false;
    }
  }

}

module.exports = strategy;
