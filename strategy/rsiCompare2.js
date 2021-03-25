
const CONFIG = require('../config')();

//buySell = 1 -> 구매여부
//buySell = 2 -> 판매매여부
async function strategy(buySell, lastRSI){
  var testArr = [
    1,2,3,4,5,
    6,7,8,9,10,
    9,8,7,7,8,
    6,5,4,3,2,
    3,4,5,6,7,
    8,9,10,9,8,
    7,6,5,4,3,
    4,3,4 ];
  
  var nowLow = false;
  var lastLowPoint = 0;
  var upSigCnt = 0;
  var point = 5;
  
  for(let i=0; i<testArr.length; i++){
     if(testArr[i] <= point){
      if(testArr[i-1]<testArr[i]) upSigCnt++;
      if(lastLowPoint==0) lastLowPoint = i;
      nowLow;
    }else{
      lastLowPoint = 0;
      upSigCnt = 0;
    }
  }
  
  if(!nowLow && upSigCnt>=2){
    //sell
  }
  
  //매수전
  if(buySell == 1){
    if(lastRSI<=CONFIG.LOW_POINT){
      return true;
    }else{
      return false;
    }
  //매도전
  }else if(buySell == 2){
    if(lastRSI>=CONFIG.HIGH_POINT){
      return true;
    }else{
      return false;
    }
  }

}

module.exports = strategy;
