//REQUIRE STUFF
const fs = require('fs');
const getDuration = require('get-video-duration');

//CLARIFAI STUFF
const Clarifai = require('clarifai');
const app = new Clarifai.App({apiKey: 'dba333a3ed5e4ffcacd99a6d0f9d9057'});

//GLOBAL STUFF
var secondsThreshold = 2;
var probabilityThreshold = 0.98;
var minFileNumber = 1;
var maxFileNumber = 225;
var videoFileDir = 'fullMovies/goodwillhunting/';
var conceptFileDir = 'conceptFiles/goodwillhunting/';

/*
SPLIT THE FILE WITH
mp4box -splits 9000 movie.mp4
*/
// makeScreenPredictions();
// offsetForDuration();
createOneConceptFile();


/***************************
PREDICT
***************************/

function makeScreenPredictions() {
    for (var i = minFileNumber; i < maxFileNumber + 1; i++) {
        var filename = getfilename(i);
        var data = fs.readFileSync(videoFileDir + filename + ".mp4", {encoding: 'base64'});
        console.log("file converted to base64");
        var encodedVideo = {
            base64: data
        }
        getPredictData(encodedVideo, filename);
    }
}

function getPredictData(encodedVideo, filename) {
    console.log("inside getPredictData for filename: " + filename);
    app.models.predict(Clarifai.GENERAL_MODEL, encodedVideo, {
        video: true
    }, max_concepts = 150).then(function(response) {
        console.log("inside predict");
        keyConcepts = findKeyConcepts(response);
        fs.writeFile(conceptFileDir + filename + '.json', JSON.stringify(keyConcepts, null, 2), function() {
            console.log('concept written');
        });
    }, function(err) {
        console.log(err.data);
        var res = JSON.stringify(err.data, null, 2);
        fs.writeFile('error.json', res, function() {
            console.log("error written");
        });
    }).catch(function(err) {
        console.log("inside catch");
        console.log(err);
    })
}


/***************************
OFFSET FOR DURATION
***************************/

function offsetForDuration() {
    var durationArray = [];
    durationArray[0] = null;
    for (var i = minFileNumber; i < maxFileNumber + 1; i++) {
        addDataForDuration(i, durationArray);
    }
}

function addDataForDuration(fileNumber, durationArray) {
    var videoFilename = videoFileDir + getfilename(fileNumber) + '.mp4';
    getDuration(videoFilename).then((duration) => {
        durationArray[fileNumber] = duration * 1000;
        offsetAllData(durationArray);
    });
}

var functionCalled = 0;
function offsetAllData(durationArray) {
    functionCalled += 1;
    if (functionCalled == maxFileNumber - minFileNumber + 1) {
        console.log("functionCalled: " + functionCalled);
        for (var i = minFileNumber; i < maxFileNumber + 1; i++) {
            var fileData = JSON.parse(fs.readFileSync(conceptFileDir + getfilename(i) + '.json'));
            var offset = getOffset(i, durationArray);
            var fileKeys = Object.keys(fileData);
            for (var j = 0; j < fileKeys.length; j++) {
                for (var k = 0; k < fileData[fileKeys[j]].length; k++) {
                    fileData[fileKeys[j]][k] += offset;
                }
            }
            var newFileData = JSON.stringify(fileData, null, 2);
            fs.writeFile(conceptFileDir + getfilename(i) + '.json', newFileData, function() {
                console.log("newFileData written");
            });
        }
    }
}
function getOffset(fileNumber, durationArray) {
    var offset = 0;
    for (var i = 1; i < fileNumber; i++) {
        offset += durationArray[i];
    }
    return offset;
}


/***************************
CREATE ONE FILE
***************************/

function createOneConceptFile() {
  var allConceptData = {};
  for (var i = minFileNumber; i < maxFileNumber + 1; i++) {
      var fileData = JSON.parse(fs.readFileSync(conceptFileDir + getfilename(i) + '.json'));
      var keyConcepts = Object.keys(fileData);
      for (var j = 0; j < keyConcepts.length; j++) {
          if (allConceptData[keyConcepts[j]]) {
              allConceptData[keyConcepts[j]] = allConceptData[keyConcepts[j]].concat(fileData[keyConcepts[j]]);
          } else {
              allConceptData[keyConcepts[j]] = fileData[keyConcepts[j]];
          }
      }
  }
  // console.log(allConceptData);
  var allDataText = JSON.stringify(allConceptData, null, 2);
  fs.writeFile(conceptFileDir + 'allConcepts.json', allDataText, function() {
      console.log("all files combined");
  });
}


/***************************
UTILITY FUNCTIONS
***************************/

function getfilename(fileNumber) {
    if (fileNumber < 10) {
        return 'movie_00' + fileNumber.toString();
    } else if (fileNumber < 100) {
        return 'movie_0' + fileNumber.toString();
    } else {
        return 'movie_' + fileNumber.toString();
    }
}

function findKeyConcepts(rawInput) {
    //Finding all the keyConcepts
    var keyConcepts = {};
    var framesArray = rawInput.outputs[0].data.frames;
    for (var i = 0; i < framesArray.length; i++) {
        var frame_time_info = framesArray[i].frame_info.time;
        var conceptsArray = framesArray[i].data.concepts;
        for (var j = 0; j < conceptsArray.length; j++) {
            if (conceptsArray[j].value > probabilityThreshold) {
                if (!(keyConcepts[conceptsArray[j].name])) {
                    keyConcepts[conceptsArray[j].name] = [];
                }
                keyConcepts[conceptsArray[j].name].push(frame_time_info);
            }
        }
    }
    //cleaning up the concepts, removing concepts that were detected for less than n seconds
    var keyConceptsNames = Object.keys(keyConcepts);
    for (var i = keyConceptsNames.length - 1; i >= 0; i--) {
        var conceptTimingArray = keyConcepts[keyConceptsNames[i]];
        if (conceptTimingArray.length > 2) {
            var indexPot = [];
            for (var j = conceptTimingArray.length - 1; j >= 1; j--) {
                if (conceptTimingArray[j] - conceptTimingArray[j - 1] == 1000) {
                    indexPot.push(j);
                } else {
                    if (indexPot.length < secondsThreshold) {
                        keyConcepts[keyConceptsNames[i]].splice(j, indexPot.length + 1);
                    }
                    // else {
                    //   console.log("Saving: " + keyConceptsNames[i] + " because indexPot length is " + indexPot.length + "\n" + indexPot);
                    // }
                    indexPot = [];
                }
                if (j == 1 && indexPot.length < secondsThreshold) {
                    keyConcepts[keyConceptsNames[i]].splice(j - 1, indexPot.length + 2);
                }
            }
        }
        if (conceptTimingArray.length < secondsThreshold) {
            delete keyConcepts[keyConceptsNames[i]];
        }
    }
    return keyConcepts;
}
