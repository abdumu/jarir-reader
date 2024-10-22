const inquirer = require('inquirer');

function BottomInfo(duringText, finishText, icons) {

  if (!(this instanceof BottomInfo)) {
    return new BottomInfo(duringText, finishText, icons);
  }

  this.icons = icons || ['/', '|','\\', '-'];
  this.loader = [`${this.icons[0]} ${duringText}`, `${this.icons[1]} ${duringText}.`, `${this.icons[2]} ${duringText}..`, `${this.icons[3]} ${duringText}...`];
  this.i = 4;
  this.ui = new inquirer.ui.BottomBar({
    bottomBar: this.loader[this.i % 4]
  });

  this.enabled = false;

  this.finishText = finishText;
};

BottomInfo.prototype.interval = function interval() {
    const that = this
    this.ui.updateBottomBar(this.loader[this.i++ % 4]);
    setTimeout(() => {
      if(that.enabled) {
        that.interval()
      }
    }, 500);
}

BottomInfo.prototype.start = function start() {
  this.enabled = true;
  this.interval();
}

BottomInfo.prototype.end = function end() {
  this.enabled = false;
  this.ui.updateBottomBar(`${this.finishText}`);
}


module.exports = BottomInfo;