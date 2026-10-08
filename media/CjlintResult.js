/*
 * Copyright (c) 2023 Huawei Technologies Co., Ltd.
 * Cangjie is licensed under Mulan PSL v2.
 * You can use this software according to the terms and conditions of the Mulan PSL v2.
 * You may obtain a copy of Mulan PSL v2 at:
 *     http://license.coscl.org.cn/MulanPSL2
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY OR
 * FIT FOR A PARTICULAR PURPOSE.
 * See the Mulan PSL v2 for more details.
 */

const vscode = acquireVsCodeApi();

window.addEventListener('message', event => {
  let jsondata = event.data;
  if (document.getElementById("table")) {
    document.getElementById("table").remove();
  }
  createTab(jsondata);
});

function createTab(json) {
  let table = document.createElement("table");
  table.id = "table";
  table.className = "table";
  let thead = document.createElement("thead");
  table.appendChild(thead);
  let tr = document.createElement("tr");
  thead.appendChild(tr);
  for (let key in json[0]) {
    let th = document.createElement("th");
    th.className = "th";
    th.innerHTML = key;
    if (key === 'column') {
      th.innerHTML = 'startColumn';
    }
    if (key === 'line') {
      th.innerHTML = 'startLine';
    }
    tr.appendChild(th);
  }
  let tbody = document.createElement("tbody");
  table.appendChild(tbody);
  for (let i = 0; i < json.length; i++) {
    let tr = document.createElement("tr");
    for (let key in json[i]) {
      let td = document.createElement("td");
      td.className = "td";
      if (key === 'file') {
        let a = document.createElement('a');
        let str = json[i][key];
        if (navigator.userAgent.match(/windows/i)) {
          str = str.replace(/\\\\/g, '/');
        }
        a.innerHTML = str.substr(str.lastIndexOf('/')).replace('/', '');
        a.href = "javascript:void(0)";
        a.id = i;
        td.appendChild(a);
        a.addEventListener("click", function (e) {
          let key = e.currentTarget.attributes.id.value;
          vscode.postMessage({
            fileName: json[key]['file'],
            column: json[key]['column'],
            line: json[key]['line']
          });
        });
      } else {
        td.innerHTML = json[i][key];
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  document.getElementById("data")?.appendChild(table);
}
