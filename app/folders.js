document.addEventListener('DOMContentLoaded', () => {
    const FOLDERS_STORE_NAME = 'folders';
    const FOLDER_ARTISTS_STORE_NAME = 'folder_artists';

    const foldersPanelWrapper = document.getElementById('folders-panel-wrapper');
    const foldersListContainer = document.getElementById('folders-list');
    const addFolderBtn = document.getElementById('add-folder-btn');
    const galleryContainer = document.getElementById('gallery-container');

    let folders = [];
    let folderArtists = new Map(); // Map<folderId, Array<{id: string, added: number}>>
    let allItemsMap = new Map(); // Map<artistId, artistData> for quick lookup
    let activeFolderId = 'unsorted'; // 'unsorted' by default
    let db;

    // --- Инициализация ---

    function initFolders() {
        db = window.appGlobals.db;
        if (!db) {
            console.error("Database not initialized in app.js");
            return;
        }
        
        // Populate allItemsMap from appGlobals.allItems
        if (window.appGlobals.allItems) {
            window.appGlobals.allItems.forEach(item => {
                allItemsMap.set(item.id, item);
            });
        }
        setupScrollListener();
        loadDataAndRender();
    }

    async function loadDataAndRender() {
        await loadFolders();
        await loadFolderArtists();
        renderFolders();
    }

    // --- Загрузка данных из IndexedDB ---

    function loadFolders() {
        return new Promise(resolve => {
            const transaction = db.transaction(FOLDERS_STORE_NAME, 'readonly');
            const store = transaction.objectStore(FOLDERS_STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => {
                folders = request.result.sort((a, b) => a.name.localeCompare(b.name));
                resolve();
            };
        });
    }

    function loadFolderArtists() {
        return new Promise(resolve => {
            folderArtists.clear();
            const transaction = db.transaction(FOLDER_ARTISTS_STORE_NAME, 'readonly');
            const store = transaction.objectStore(FOLDER_ARTISTS_STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => {
                request.result.forEach(item => {
                    folderArtists.set(item.folderId, item.artistIds); // Загружаем как массив
                });
                resolve();
            };
        });
    }

    // --- Отрисовка ---

    function renderFolders() {
        if (!foldersListContainer) return;
        foldersListContainer.innerHTML = '';

        // 1. Создаем и добавляем папку "Неотсортированное"
        const unsortedFolderEl = createUnsortedFolderElement();
        foldersListContainer.appendChild(unsortedFolderEl);

        // 2. Отрисовываем папки, созданные пользователем
        folders.forEach(folder => {
            const folderEl = createFolderElement(folder);
            if (folder.id === activeFolderId) folderEl.classList.add('active');
            foldersListContainer.appendChild(folderEl);
        });

        // 3. Перемещаем кнопку "Add Folder" в конец сетки
        if (addFolderBtn) {
            foldersListContainer.appendChild(addFolderBtn);
        }

        // Поведение скролла теперь управляется постоянным слушателем событий
    }

    /**
     * Устанавливает слушатель событий 'wheel' для контейнера папок,
     * чтобы предотвратить прокрутку основной страницы, пока прокручивается сам контейнер.
     */
    function setupScrollListener() {
        foldersListContainer.addEventListener('wheel', (e) => {
            const el = foldersListContainer;
            const { deltaY } = e;
            const { scrollTop, scrollHeight, clientHeight } = el;

            // Проверяем, есть ли вообще прокрутка в элементе
            if (scrollHeight <= clientHeight) {
                // Если прокрутки нет, ничего не делаем, событие всплывет и прокрутит страницу
                return;
            }

            // Если крутим вниз (deltaY > 0)
            if (deltaY > 0) {
                // Если мы еще не достигли самого низа
                if (scrollTop < scrollHeight - clientHeight) {
                    e.preventDefault(); // Блокируем прокрутку страницы
                    el.scrollTop += deltaY; // и прокручиваем панель вручную
                }
            } else { // Если крутим вверх (deltaY < 0)
                // Если мы еще не на самом верху
                if (scrollTop > 0) {
                    e.preventDefault(); // Блокируем прокрутку страницы
                    el.scrollTop += deltaY; // и прокручиваем панель вручную
                }
            }
        }, { passive: false }); // passive: false необходимо для работы preventDefault()
    }

    function getUnsortedArtistIds() {
        const favorites = window.appGlobals.favorites;
        if (!favorites) return new Set();

        // 1. Собираем ID всех артистов, которые уже лежат в папках
        const allCategorizedArtists = new Set();
        for (const artistIdArray of folderArtists.values()) {
            artistIdArray.forEach(item => allCategorizedArtists.add(item.id));
        }

        // 2. Находим ID артистов, которые есть в избранном, но не в папках
        const favoriteArtistIds = Array.from(favorites.keys());
        return new Set(favoriteArtistIds.filter(id => !allCategorizedArtists.has(id)));
    }

    /**
     * Создает элемент для виртуальной папки "Неотсортированное".
     */
    function createUnsortedFolderElement() {
        const favorites = window.appGlobals.favorites;
        const unsortedArtistIdsSet = getUnsortedArtistIds();
        const unsortedArtistIds = Array.from(unsortedArtistIdsSet);

        // 3. Сортируем ID по времени добавления в избранное (новые первыми)
        unsortedArtistIds.sort((a, b) => favorites.get(b) - favorites.get(a));

        const unsortedCount = unsortedArtistIds.length;
        let lastUnsortedArtistImage = null;

        // 4. Находим изображение для миниатюры (самый новый несортированный артист)
        if (unsortedArtistIds.length > 0) {
            const lastUnsortedArtistId = unsortedArtistIds[0];
            const artistData = allItemsMap.get(lastUnsortedArtistId);
            if (artistData) {
                lastUnsortedArtistImage = artistData.image;
            }
        }

        // 5. Создаем DOM-элемент
        const item = document.createElement('div');
        item.className = 'folder-item folder-item--unsorted'; // Добавляем специальный класс
        item.dataset.folderId = 'unsorted'; // Специальный ID
        if (activeFolderId === 'unsorted') {
            item.classList.add('active');
        }

        const thumbnailContainer = document.createElement('div');
        thumbnailContainer.className = 'folder-item-thumbnail-container';

        if (lastUnsortedArtistImage) {
            thumbnailContainer.style.backgroundImage = `url('${lastUnsortedArtistImage}')`;
            const thumbnailImg = document.createElement('img');
            thumbnailImg.src = lastUnsortedArtistImage;
            thumbnailImg.alt = 'Unsorted';
            thumbnailImg.className = 'folder-item-thumbnail';
            thumbnailImg.loading = 'lazy';
            thumbnailContainer.appendChild(thumbnailImg);
        }

        item.innerHTML = `
            <span class="folder-name">Unsorted</span>
            <span class="folder-count">${unsortedCount}</span>
        `;
        item.appendChild(thumbnailContainer);

        // Создаем кнопку "очистки" для Неотсортированной папки
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'folder-delete-btn';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.title = 'Clear all unsorted favorites';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleClearUnsortedFolder();
        });
        item.insertBefore(deleteBtn, item.firstChild);

        // Обработчик клика для фильтрации
        item.addEventListener('click', () => {
            setActiveFolder('unsorted');
        });


        // Эта папка не должна быть переименовываемой, поэтому dblclick не добавляем.
        // Но она должна принимать перетаскиваемые карточки (хотя это бессмысленно, т.к. они и так там)
        // Оставим логику drop для консистентности, но она ничего не будет делать.
        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            item.classList.add('drag-over');
        });

        item.addEventListener('dragleave', () => {
            item.classList.remove('drag-over');
        });

        item.addEventListener('drop', (e) => {
            e.preventDefault();
            item.classList.remove('drag-over');
            // Карточки уже в "Неотсортированном", если они не в других папках.
            // Можно показать уведомление.
            window.appGlobals.showToast('This artist is already in Unsorted.');
        });

        return item;
    }

    function createFolderElement(folder) {
        const item = document.createElement('div');
        item.className = 'folder-item';
        item.dataset.folderId = folder.id;

        const artistCount = (folderArtists.get(folder.id) || []).length;

        // Основной контейнер, который будет содержать все элементы
        const thumbnailContainer = document.createElement('div');
        thumbnailContainer.className = 'folder-item-thumbnail-container';

        if (folder.lastArtistId) {
            const lastArtistData = allItemsMap.get(folder.lastArtistId);
            const lastArtistImage = lastArtistData?.image;

            // Устанавливаем изображение как фон для контейнера
            thumbnailContainer.style.backgroundImage = `url('${lastArtistImage}')`;
            const thumbnailImg = document.createElement('img');
            thumbnailImg.src = lastArtistImage;
            thumbnailImg.alt = folder.name;
            thumbnailImg.className = 'folder-item-thumbnail';
            thumbnailImg.loading = 'lazy';
            thumbnailContainer.appendChild(thumbnailImg);
        }
        // Создаем кнопку удаления
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'folder-delete-btn';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.title = 'Delete folder';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Останавливаем всплытие, чтобы не сработал клик по папке
            handleDeleteFolder(folder.id, folder.name, artistCount);
        });

        item.innerHTML = `
            <span class="folder-name">${folder.name}</span>
            <span class="folder-count">${artistCount}</span>
        `;
        item.appendChild(thumbnailContainer);
        // Добавляем кнопку удаления в DOM
        item.insertBefore(deleteBtn, item.firstChild);
        
        // Обработчик клика для фильтрации
        item.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT') setActiveFolder(folder.id);
        });

        // Переименование по двойному клику
        item.addEventListener('dblclick', (e) => {
            // Предотвращаем срабатывание, если кликнули на инпут
            if (e.target.tagName === 'INPUT') return;

            // Добавляем класс для режима переименования
            item.classList.add('is-renaming');

            const folderNameEl = item.querySelector('.folder-name');
            const oldName = folder.name;
            const input = document.createElement('input');
            input.type = 'text';
            input.value = oldName;
            input.className = 'search-input'; // Используем существующий стиль
            // Стили для инпута, чтобы он выглядел как элемент папки
            input.style.position = 'absolute';
            input.style.bottom = '8px';
            input.style.left = '8px';
            input.style.right = '8px';
            input.style.width = 'calc(100% - 16px)';
            input.style.padding = '0';
            input.style.background = 'transparent';
            input.style.border = 'none';
            input.style.color = '#fff';
            input.style.zIndex = '3';
            item.appendChild(input);
            input.focus();

            const saveName = () => {
                const newName = input.value.trim();
                if (newName && newName !== oldName) {
                    folder.name = newName;
                    const transaction = db.transaction(FOLDERS_STORE_NAME, 'readwrite');
                    transaction.objectStore(FOLDERS_STORE_NAME).put(folder);                    
                    folderNameEl.textContent = newName;
                } else {
                    folderNameEl.textContent = oldName; // Возвращаем старое имя, если ввод пустой
                }
                input.remove();
                // Убираем класс после сохранения
                item.classList.remove('is-renaming');
            };

            input.addEventListener('blur', saveName);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    input.blur();
                } else if (e.key === 'Escape') {
                    input.value = oldName;
                    input.blur();
                }
            });
        });

        // Drag and Drop
        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            item.classList.add('drag-over');
        });

        item.addEventListener('dragleave', () => {
            item.classList.remove('drag-over');
        });

        item.addEventListener('drop', (e) => {
            e.preventDefault();
            item.classList.remove('drag-over');
            const data = e.dataTransfer.getData('application/json');
            const folderId = folder.id;

            if (data.startsWith('batch:')) {
                try {
                    const artistIds = JSON.parse(data.substring(6));
                    addArtistsToFolder(folderId, artistIds);
                } catch (err) {
                    console.error("Failed to parse batch artist IDs", err);
                    window.appGlobals.showToast('Error moving artists.');
                }
            } else {
                // Одиночное перемещение
                addArtistToFolder(folderId, data);
            }
        });

        return item;
    }

    function setActiveFolder(folderId, shouldRender = true) {
        if (activeFolderId === folderId && shouldRender) return; // Не делаем ничего, если папка уже активна

        activeFolderId = folderId;

        // Обновляем классы
        const allFolderItems = foldersListContainer.querySelectorAll('.folder-item');
        allFolderItems.forEach(item => {
            item.classList.toggle('active', item.dataset.folderId === folderId);
        });

        // Вызываем перерисовку галереи в app.js
        if (shouldRender && window.appGlobals && window.appGlobals.renderView) {
            window.appGlobals.renderView();
            // renderView() автоматически сбросит выделение
        }
    }

    function handleDeleteFolder(folderId, folderName, artistCount) {
        let confirmationMessage = `Are you sure you want to delete the folder "${folderName}"?`;
        if (artistCount > 0) {
            confirmationMessage = `The folder "${folderName}" contains ${artistCount} artist(s).\n\nIf you delete it, these artists will also be REMOVED FROM FAVORITES.\n\nAre you sure you want to proceed?`;
        } 

        if (window.confirm(confirmationMessage)) {
            deleteFolder(folderId);
        }
    }

    /**
     * Обрабатывает запрос на очистку папки "Неотсортированное".
     */
    function handleClearUnsortedFolder() {
        const artistIdsToDelete = getUnsortedArtistIds();
        if (artistIdsToDelete.size === 0) {
            window.appGlobals.showToast("Unsorted folder is already empty.");
            return;
        }

        const confirmationMessage = `Are you sure you want to remove all ${artistIdsToDelete.size} unsorted artist(s) from your favorites? This action cannot be undone.`;

        if (window.confirm(confirmationMessage)) {
            const tx = db.transaction(window.appGlobals.STORE_NAME, 'readwrite');
            const favoritesStore = tx.objectStore(window.appGlobals.STORE_NAME);

            artistIdsToDelete.forEach(artistId => favoritesStore.delete(artistId));

            tx.oncomplete = () => {
                artistIdsToDelete.forEach(artistId => window.appGlobals.favorites.delete(artistId));
                window.appGlobals.showToast(`${artistIdsToDelete.size} unsorted artist(s) removed from favorites.`);
                
                // Перерисовываем обе панели для полной синхронизации
                renderFolders();
                window.appGlobals.renderView();
            };

            tx.onerror = (event) => {
                window.appGlobals.showToast('Error clearing unsorted favorites.');
                console.error("Error clearing unsorted favorites:", event.target.error);
            };
        }
    }

    function deleteFolder(folderId) {
        const artistIdsToDelete = (folderArtists.get(folderId) || []).map(item => item.id);

        // 1. Удаляем из массивов в памяти
        folders = folders.filter(f => f.id !== folderId);

        // 2. Используем одну транзакцию для удаления из всех трех таблиц
        const tx = db.transaction([FOLDERS_STORE_NAME, FOLDER_ARTISTS_STORE_NAME, window.appGlobals.STORE_NAME], 'readwrite');
        const folderStore = tx.objectStore(FOLDERS_STORE_NAME);
        const folderArtistStore = tx.objectStore(FOLDER_ARTISTS_STORE_NAME);
        const favoritesStore = tx.objectStore(window.appGlobals.STORE_NAME);

        // Удаляем саму папку
        folderStore.delete(folderId);
        // Удаляем связь папки с артистами
        folderArtistStore.delete(folderId);
        // Удаляем артистов из этой папки из общего списка избранных
        artistIdsToDelete.forEach(artistId => {
            favoritesStore.delete(artistId);
        });

        tx.oncomplete = () => {
            // Обновляем данные в памяти после успешной транзакции
            folderArtists.delete(folderId);
            artistIdsToDelete.forEach(artistId => {
                window.appGlobals.favorites.delete(artistId);
            });

            window.appGlobals.showToast(`Folder "${getFolderName(folderId, true)}" and ${artistIdsToDelete.length} artist(s) deleted.`);

            // 3. Если удаленная папка была активной, переключаемся на "Неотсортированное".
            if (activeFolderId === folderId) {
                setActiveFolder('unsorted'); // Этот вызов также перерисует галерею
            } else {
                renderFolders(); // Перерисовываем панель папок
            }
        };
        tx.onerror = (event) => {
            window.appGlobals.showToast('Error deleting folder.');
            console.error("Error deleting folder transaction:", event.target.error);
        };
    }

    // --- CRUD операции ---

    function createNewFolder() {
        const name = prompt("Enter new folder name:", "New Folder");
        if (name) {
            const newFolder = {
                id: `folder-${Date.now()}`,
                name: name.trim(),
                lastArtistId: null // Поле для ID последнего добавленного артиста
            };
            folders.push(newFolder);
            folders.sort((a, b) => a.name.localeCompare(b.name)); // Поддерживаем сортировку

            const transaction = db.transaction(FOLDERS_STORE_NAME, 'readwrite');
            transaction.objectStore(FOLDERS_STORE_NAME).add(newFolder);
            transaction.oncomplete = () => {
                renderFolders();
            };
        }
    }

    function removeArtistFromPreviousFolder(artistId) {
        let sourceFolderId = null;
        let sourceFolderData = null;
        // Ищем, в какой папке находится артист
        for (const [folderId, artistIdArray] of folderArtists.entries()) {
            const artistIndex = artistIdArray.findIndex(item => item.id === artistId);
            if (artistIndex !== -1) {
                artistIdArray.splice(artistIndex, 1); // Удаляем артиста из массива
                sourceFolderId = folderId;

                // Обновляем данные в IndexedDB для исходной папки
                const transaction = db.transaction(FOLDER_ARTISTS_STORE_NAME, 'readwrite');
                const store = transaction.objectStore(FOLDER_ARTISTS_STORE_NAME);
                if (artistIdArray.length > 0) {
                    store.put({ folderId, artistIds: artistIdArray });
                } else {
                    store.delete(folderId); // Удаляем запись, если папка стала пустой
                }

                // Находим данные папки для обновления миниатюры
                sourceFolderData = folders.find(f => f.id === folderId);
                break;
            }
        }

        // Если папка-источник была найдена и это не "Unsorted"
        if (sourceFolderData) {
            // Обновляем ее миниатюру, так как последний добавленный художник мог быть удален
            const artistIdArray = folderArtists.get(sourceFolderData.id);
            if (artistIdArray && artistIdArray.length > 0) {
                const lastArtistId = artistIdArray.sort((a, b) => b.added - a.added)[0].id;
                updateFolderThumbnail(sourceFolderData.id, lastArtistId, renderFolders);
            } else {
                // Если папка стала пустой, убираем миниатюру
                updateFolderThumbnail(sourceFolderData.id, null, renderFolders);
            }
        }
        return sourceFolderId;
    }
    function addArtistToFolder(folderId, artistId) {
        if (!allItemsMap.has(artistId)) { // Теперь и ключ, и ID - строки
            window.appGlobals.showToast('Artist data not found.');
            return;
        }
        const artistData = allItemsMap.get(artistId);

        // Находим данные целевой папки для уведомления
        const destinationFolderData = folders.find(f => f.id === folderId);

        // Проверяем, не перемещаем ли мы художника в ту же папку, где он уже находится
        if (folderArtists.get(folderId)?.some(item => item.id === artistId)) {
            window.appGlobals.showToast('Artist is already in this folder.');
            return;
        }

        // Сначала удаляем артиста из любой другой папки, где он мог быть
        removeArtistFromPreviousFolder(artistId);

        if (!folderArtists.has(folderId)) {
            folderArtists.set(folderId, []);
        }
        const artistIdArray = folderArtists.get(folderId);

        // Добавляем объект с ID и временем добавления
        artistIdArray.push({ id: artistId, added: Date.now() });

        // Update folder_artists store
        const folderArtistsTransaction = db.transaction(FOLDER_ARTISTS_STORE_NAME, 'readwrite');
        const folderArtistsStore = folderArtistsTransaction.objectStore(FOLDER_ARTISTS_STORE_NAME);
        folderArtistsStore.put({ folderId, artistIds: artistIdArray });

        folderArtistsTransaction.oncomplete = () => {
            // 1. Обновляем миниатюру для целевой папки
            updateFolderThumbnail(folderId, artistId, () => {
                // 2. После обновления миниатюры, перерисовываем панель папок.
                renderFolders();

                // 3. Плавно удаляем карточку из DOM, вместо полной перерисовки
                const cardToRemove = galleryContainer.querySelector(`.card[data-id="${artistId}"]`);
                if (cardToRemove) {
                    cardToRemove.style.transition = 'opacity 0.3s ease, transform 0.3s ease, max-height 0.3s ease 0.1s, margin 0.3s ease 0.1s, padding 0.3s ease 0.1s';
                    cardToRemove.style.opacity = '0';
                    cardToRemove.style.transform = 'scale(0.9)';
                    cardToRemove.style.maxHeight = '0px';
                    cardToRemove.style.margin = '0';
                    cardToRemove.style.padding = '0';
                    cardToRemove.addEventListener('transitionend', () => cardToRemove.remove(), { once: true });
                }

                // 4. Показываем уведомление
                if (destinationFolderData) {
                    window.appGlobals.showToast(`Moved to "${destinationFolderData.name}"`);
                }
            });
        };
        folderArtistsTransaction.onerror = (event) => {
            console.error("Error adding artist to folder_artists:", event.target.error);
            window.appGlobals.showToast('Error adding artist to folder.');
        };
    }

    function addArtistsToFolder(folderId, artistIds) {
        if (!artistIds || artistIds.length === 0) return;

        const destinationFolderData = folders.find(f => f.id === folderId);
        if (!destinationFolderData) return;

        let movedCount = 0; // Счетчик реально перемещенных артистов
        const artistsToMove = [];

        // 1. Подготовка данных и транзакций
        artistIds.forEach(artistId => {
            const artistIdStr = String(artistId); // Убедимся, что ID - строка
            if (folderArtists.get(folderId)?.some(item => item.id === artistIdStr)) {
                return; // Пропускаем, если артист уже в этой папке
            }
            removeArtistFromPreviousFolder(artistIdStr);
            artistsToMove.push(artistIdStr); // Добавляем в список на перемещение
            movedCount++;
        });

        if (movedCount === 0) {
            window.appGlobals.showToast('Selected artists are already in this folder.');
            return;
        }

        if (!folderArtists.has(folderId)) {
            folderArtists.set(folderId, []);
        }
        const artistArray = folderArtists.get(folderId);
        const now = Date.now();

        // 2. Создаем массив новых артистов с убывающими таймстемпами, чтобы сохранить порядок
        const newArtistsData = artistsToMove.map((id, index) => ({
            id: String(id),
            added: now - index // Первый выбранный (index 0) получит самый большой timestamp
        }));

        // 3. Сохранение изменений в IndexedDB
        const updatedArtistArray = [...newArtistsData, ...artistArray];
        const folderArtistsTransaction = db.transaction(FOLDER_ARTISTS_STORE_NAME, 'readwrite');
        folderArtistsTransaction.objectStore(FOLDER_ARTISTS_STORE_NAME).put({ folderId, artistIds: updatedArtistArray });
        folderArtists.set(folderId, updatedArtistArray); // Обновляем данные в памяти
        folderArtistsTransaction.oncomplete = () => {
            // 4. Обновление миниатюры папки (используем ПЕРВОГО артиста из списка)
            const lastArtistId = String(artistsToMove[0]);

            updateFolderThumbnail(folderId, lastArtistId, () => {
                // 5. Перерисовка панели папок для обновления всех счетчиков
                renderFolders();

                // 6. Плавное удаление всех перемещенных карточек из DOM
                artistIds.forEach(artistId => {
                    const cardToRemove = galleryContainer.querySelector(`.card[data-id="${artistId}"]`);
                    if (cardToRemove) {
                        cardToRemove.style.transition = 'opacity 0.3s ease, transform 0.3s ease, max-height 0.3s ease 0.1s, margin 0.3s ease 0.1s, padding 0.3s ease 0.1s';
                        cardToRemove.style.opacity = '0';
                        cardToRemove.style.transform = 'scale(0.9)';
                        cardToRemove.style.maxHeight = '0px';
                        cardToRemove.style.margin = '0';
                        cardToRemove.style.padding = '0';
                        cardToRemove.addEventListener('transitionend', () => cardToRemove.remove(), { once: true });
                    }
                });

                // 7. Сброс выделения и показ уведомления
                window.appGlobals.showToast(`Moved ${movedCount} artist(s) to "${destinationFolderData.name}"`);
                // Функция clearSelection будет вызвана из app.js
                document.dispatchEvent(new CustomEvent('clear-selection'));
            });
        };
    }

    function updateFolderThumbnail(folderId, artistId, onCompleteCallback) {
        const transaction = db.transaction(FOLDERS_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(FOLDERS_STORE_NAME);
        store.get(folderId).onsuccess = (event) => {
            const folderToUpdate = event.target.result;
            if (folderToUpdate) {
                folderToUpdate.lastArtistId = String(artistId);
                store.put(folderToUpdate);
                // Обновляем данные в локальном массиве для немедленной перерисовки
                const localFolder = folders.find(f => f.id === folderId);
                if (localFolder) {
                    localFolder.lastArtistId = artistId;
                }
            }
        };
        if (onCompleteCallback) {
            transaction.oncomplete = onCompleteCallback;
        }
    }

    // --- Обработчики событий ---

    if (addFolderBtn) {
        addFolderBtn.addEventListener('click', createNewFolder);
    }

    // Делегирование событий для dragstart на карточках
    galleryContainer.addEventListener('dragstart', (e) => {
        const card = e.target.closest('.card');
        if (!card || window.appGlobals.currentView !== 'favorites') return;

        // Получаем Map выбранных артистов из app.js
        const selectedArtistsMap = window.appGlobals.selectedArtists;
        // Сортируем ID по времени выбора (от старого к новому)
        const selectedArtistIds = Array.from(selectedArtistsMap.entries())
                                       .sort((a, b) => a[1] - b[1])
                                       .map(entry => entry[0]);

        const isDraggingSelection = selectedArtistIds.length > 0 && selectedArtistIds.includes(card.dataset.id);

        if (isDraggingSelection) {
            // Перетаскиваем группу
            e.dataTransfer.setData('application/json', `batch:${JSON.stringify(selectedArtistIds)}`);

            // Создаем кастомное изображение для перетаскивания
            const dragImage = document.createElement('div');
            dragImage.className = 'folder-count batch-drag-image'; // Используем стиль счетчика
            dragImage.textContent = `+${selectedArtistIds.length}`;
            dragImage.style.position = 'absolute';
            dragImage.style.top = '-1000px'; // Прячем за экраном
            document.body.appendChild(dragImage);
            e.dataTransfer.setDragImage(dragImage, 15, 15); // Смещаем, чтобы было под курсором

            // Удаляем элемент после начала перетаскивания
            setTimeout(() => document.body.removeChild(dragImage), 0);

        } else {
            // Одиночное перетаскивание: сбрасываем выделение
            document.dispatchEvent(new CustomEvent('clear-selection'));
            e.dataTransfer.setData('application/json', card.dataset.id);
        }
        e.dataTransfer.effectAllowed = 'move';
    });

    // Глобальный слушатель для сброса выделения
    document.addEventListener('clear-selection', () => {
        document.querySelectorAll('.card.selected').forEach(c => c.classList.remove('selected'));
        // В app.js тоже нужно будет очистить Set, создадим там функцию
    });

    // Слушатель для сброса выделения по клику вне карточек
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.card') && !e.target.closest('.folders-panel')) {
             document.dispatchEvent(new CustomEvent('clear-selection'));
        }
    });

    function getFolderName(folderId, returnOldNameAfterDeletion = false) {
        if (folderId === 'unsorted') {
            return 'Unsorted';
        }
        // Если папка уже удалена, мы не сможем найти ее в `folders`
        const folder = folders.find(f => f.id === folderId) || (returnOldNameAfterDeletion ? { name: 'Deleted Folder' } : null);
        return folder ? folder.name : '';
    }

    /**
     * Обрабатывает удаление артиста из избранного.
     * Вызывается из app.js для синхронизации состояния папок.
     * @param {string} artistId ID удаленного из избранного артиста.
     */
    function handleFavoriteRemoval(artistId) {
        const sourceFolderId = removeArtistFromPreviousFolder(artistId);

        // Если артист не был ни в одной папке (был в Unsorted), то просто перерисовываем
        if (!sourceFolderId) {
            renderFolders();
        }
    }

    // --- Экспорт для app.js ---
    window.appFolders = {
        init: initFolders,
        showPanel: () => { 
            if (foldersPanelWrapper && window.innerWidth > 992) {
                foldersPanelWrapper.style.display = 'block'; 
            }
        },
        hidePanel: () => { if(foldersPanelWrapper) foldersPanelWrapper.style.display = 'none'; },
        get activeFolderId() { return activeFolderId; },
        setActiveFolder: setActiveFolder,
        getArtistIdsInFolder: (folderId) => {
            const items = folderArtists.get(folderId) || [];
            return items.sort((a, b) => b.added - a.added).map(item => item.id);
        },
        getUnsortedArtistIds: getUnsortedArtistIds,
        getFolderName: getFolderName,
        handleFavoriteRemoval: handleFavoriteRemoval,
        get folders() { return folders; }, // Экспортируем массив папок
        get folderArtists() { return folderArtists; }, // Экспортируем Map связей
        loadData: loadDataAndRender // Экспортируем функцию для перезагрузки данных
    };
});