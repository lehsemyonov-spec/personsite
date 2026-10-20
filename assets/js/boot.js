/* Выполняется в <head> до отрисовки: включает JS-анимации и укорачивает
   прелоадер при повторном заходе в рамках одной вкладки. */
(function () {
  var root = document.documentElement;
  root.classList.add("js");
  try {
    if (sessionStorage.getItem("izba-visited")) root.classList.add("is-quick");
    sessionStorage.setItem("izba-visited", "1");
  } catch (e) { /* хранилище недоступно — просто показываем полный прелоадер */ }
})();
