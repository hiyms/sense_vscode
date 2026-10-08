// 提供 WebView 组件与宿主扩展之间的消息通道
const vscode = acquireVsCodeApi();

/** 监听路径选择按钮的点击事件 */
document.getElementById('selectPathBtn').addEventListener('click', function () {
  selectPath();
});

/** 输入框获得焦点时隐藏重名提示 */
document.getElementById('projectName').onfocus = () => {
  document.getElementById('showErrorRepeatsName').style.display = 'none';
}

/** 输入框失去焦点时校验工程名并显示提示 */
document.getElementById('projectName').onblur = (event) => {
  const projectName = event.target.value;
  const nameAvailable = projectNameVerification(projectName);
  document.getElementById('showErrorName').style.display = nameAvailable ? 'none' : 'inherit';
}

/** 监听取消按钮的点击事件 */
document.getElementById('cancelBtn').addEventListener('click', function () {
  finishSetting('cancel');
});

/** 监听确认按钮的点击事件 */
document.getElementById('completeBtn').addEventListener('click', function () {
  finishSetting('complete');
});

/** 向宿主扩展发送路径选择请求 */
function selectPath() {
  vscode.postMessage({
	command: 'selectPath'
  });
}

/**
 * 向宿主扩展发送确认或取消消息
 * @param type : 消息类型，'complete' 表示确认，其余表示取消
 */
function finishSetting(type) {
  if (type === 'complete') {
	const selectOutputType = document.getElementById('outputType');
	const selectPath = document.getElementById('projectDir');
	const projectName = document.getElementById('projectName');
	const nameAvailable = projectNameVerification(projectName.value);
	document.getElementById('showErrorPath').style.display = selectPath.value ? 'none' : 'inherit';
	document.getElementById('showErrorName').style.display = nameAvailable ? 'none' : 'inherit';
	if (selectPath.value && nameAvailable) {
	  vscode.postMessage({
		command: 'finishSetting',
		projectDir: selectPath.value,
		projectName: projectName.value.trim(),
		outputType: selectOutputType.value
	  });
	}
  } else {
	vscode.postMessage({
	  command: 'cancelSetting',
	});
  }
}

/** 监听宿主扩展发来的消息 */
window.addEventListener('message', event => {
  const message = event.data;
  const projectDir = document.getElementById('projectDir');
  switch (message.command) {
	case 'showPath':
	  if (message.text) {
		projectDir.value = message.text;
		document.getElementById('showErrorPath').style.display = 'none';
	  } else {
		projectDir.value = '';
		document.getElementById('showErrorPath').style.display = 'inherit';
	  }
	  break;
	case 'repeatsName':
	  document.getElementById('showErrorRepeatsName').style.display = message.text ? 'inherit' : 'none';
	default:
	  break;
	}
});

/** 校验工程名：以字母开头，仅允许字母、数字与下划线 */
function projectNameVerification(name) {
  const REGEXP_NAME = /^([a-zA-Z][a-zA-Z0-9_]*)$/;
  if (name === '' || (name && !name.match(REGEXP_NAME))) {
	return false;
  }
  return true;
}
