const CONFIG = require('../config')();

//buySell = 1 -> 구매여부
//buySell = 2 -> 판매매여부
async function strategy(buySell, rsiRes,lastPrice, price,weight=0){

  var lastRSI = (rsiRes[rsiRes.length - 1] >= 0)? rsiRes[rsiRes.length - 1] : 0;
  var lastRSI2 = (rsiRes[rsiRes.length - 2] >= 0)? rsiRes[rsiRes.length - 2] : 0;
  var lastRSI3 = (rsiRes[rsiRes.length - 3] >= 0)? rsiRes[rsiRes.length - 3] : 0;
  var lastRSI4 = (rsiRes[rsiRes.length - 4] >= 0)? rsiRes[rsiRes.length - 4] : 0;

  var lowPoint = CONFIG.LOW_POINT-weight
  //console.log('upbit',lastRSI3,lastRSI2,lastRSI, lowPoint, buySell)
  //매수전
  if(buySell == 1){

    if(lastRSI3>lastRSI2 && lastRSI2<lastRSI && (lastRSI2<=lowPoint || lastRSI2<=lowPoint))
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
