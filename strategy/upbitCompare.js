const CONFIG = require('../config')();

//buySell = 1 -> 구매여부
//buySell = 2 -> 판매매여부
async function strategy(buySell, rsiRes,lastPrice, price,weight=0){

  var lastRSI = (rsiRes[rsiRes.length - 1] >= 0)? rsiRes[rsiRes.length - 1] : 0;


  //매수전
  if(buySell == 1){
    console.log('lastRSI',lastRSI)
    console.log('rsiRes[rsiRes.length - 2]',rsiRes[rsiRes.length - 2],rsiRes[rsiRes.length - 1])

    if(lastRSI<=CONFIG.LOW_POINT-weight && rsiRes[rsiRes.length - 2]<rsiRes[rsiRes.length - 1]){
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
