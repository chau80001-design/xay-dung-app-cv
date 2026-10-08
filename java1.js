// --- QUẢN LÝ DỮ LIỆU HỆ THỐNG (Tích hợp LocalStorage & Base64) ---
let dbCongViec = JSON.parse(localStorage.getItem('dbCongViec_Data')) || [];
let isLoggedIn = false;
let currentUser = null;

// Danh sách tài khoản người dùng (mật khẩu đã mã hóa base64)
const userAccounts = [
    { username: "admin",  password: "YWRtaW4xMjM=", role: "admin",  department: "Quản trị viên" },
    { username: "qlgt",   password: "cWxndDEyMw==", role: "member", department: "Đội QLGT" },
    { username: "qlml",   password: "cWxtbDEyMw==", role: "member", department: "Đội QLML" },
    { username: "kd",     password: "a2QxMjM=",     role: "member", department: "Ban KinhDoanh" },
    { username: "vattu",  password: "dnQxMjM=",     role: "member", department: "Ban Kế hoạch vật tư" },
];

// Hàm lưu mảng dữ liệu vào bộ nhớ trình duyệt
function luuVaoLocalStorage() {
    luuVaoOneDrive();
}

// Hàm kiểm tra file ảnh hợp lệ (kiểu và kích thước)
function validateImage(file) {
    if (!file.type.startsWith('image/')) {
        alert("File tải lên phải là định dạng ảnh (JPG, PNG, GIF)!");
        return false;
    }
    if (file.size > 5 * 1024 * 1024) {
        alert("Kích thước ảnh không được vượt quá 5MB!");
        return false;
    }
    return true;
}



// --- CẤU HÌNH KẾT NỐI ONEDRIVE (MICROSOFT GRAPH API) ---
const msalConfig = {
    auth: {
        clientId: "ba146a0f-5848-4018-9054-eccf08c8b925",
        authority: "https://login.microsoftonline.com/common",
        redirectUri: "https://github.io",
    },
    cache: {
        cacheLocation: "sessionStorage",
        storeAuthStateInCookie: false,
    }
};


// ĐÚNG: Gọi trực tiếp đối tượng msal toàn cục từ thư viện
let myMSALObj = null;
try {
    myMSALObj = new msal.PublicClientApplication(msalConfig);
} catch (e) {
    console.warn("MSAL chưa sẵn sàng (CDN chưa tải). Tính năng OneDrive sẽ tắt.", e);
}

let graphToken = null;
const FILE_NAME_ONEDRIVE = "dbCongViec_Data.json"; // Tên file tự động sinh ra trên OneDrive

// 1. HÀM ĐĂNG NHẬP TÀI KHOẢN MICROSOFT
async function dangNhapOneDrive() {
    if (!myMSALObj) {
        alert("Thư viện MSAL chưa được tải. Vui lòng kiểm tra kết nối mạng!");
        return;
    }
    try {
        const loginResponse = await myMSALObj.loginPopup({
            scopes: ["Files.ReadWrite", "User.Read"]
        });
        myMSALObj.setActiveAccount(loginResponse.account);
        
        // Lấy Token để gọi API
        const tokenResponse = await myMSALObj.acquireTokenSilent({
            scopes: ["Files.ReadWrite"]
        });
        graphToken = tokenResponse.accessToken;

        const btnAuth = document.getElementById('btnOneDriveAuth');
        if (btnAuth) {
            btnAuth.innerHTML = "🟢 Đã kết nối OneDrive";
            btnAuth.classList.replace("btn-primary", "btn-success");
        }
        
        // Sau khi đăng nhập thành công, tự động tải dữ liệu từ OneDrive về app
        await taiDuLieuTuOneDrive();
    } catch (error) {
        console.error("Lỗi đăng nhập OneDrive:", error);
        alert("Đăng nhập tài khoản Microsoft thất bại!");
    }
}

// 2. HÀM ĐỒNG BỘ ĐẨY DỮ LIỆU LÊN ONEDRIVE (Thay thế luuVaoLocalStorage)
async function luuVaoOneDrive() {
    localStorage.setItem('dbCongViec_Data', JSON.stringify(dbCongViec));

    if (!graphToken) {
        return;
    }

    try {
        const url = `https://graph.microsoft.com/v1.0/me/drive/root:/${FILE_NAME_ONEDRIVE}:/content`;
        const response = await fetch(url, {
            method: "PUT",
            headers: {
                "Authorization": `Bearer ${graphToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(dbCongViec)
        });

        if (!response.ok) throw new Error("Không thể upload file");
        console.log("Đã đồng bộ dữ liệu lên cloud OneDrive thành công!");
    } catch (error) {
        console.error("Lỗi lưu OneDrive:", error);
    }
}

// 3. HÀM TẢI DỮ LIỆU TỪ ONEDRIVE XUỐNG KHI MỞ APP
async function taiDuLieuTuOneDrive() {
    if (!graphToken) return;
    
    try {
        const url = `https://graph.microsoft.com/v1.0/me/drive/root:/${FILE_NAME_ONEDRIVE}:/content`;
        const response = await fetch(url, {
            headers: { "Authorization": `Bearer ${graphToken}` }
        });

        if (response.status === 404) {
            // Nếu chưa có file trên cloud, khởi tạo mảng rỗng
            dbCongViec = [];
            await luuVaoOneDrive();
        } else if (response.ok) {
            dbCongViec = await response.json();
            console.log("Đã tải dữ liệu từ OneDrive thành công!", dbCongViec);
        }
        renderAllTables();
    } catch (error) {
        console.error("Lỗi tải dữ liệu OneDrive:", error);
    }
}







// 1. ĐÓNG / MỞ CỬA SỔ MODAL ĐĂNG NHẬP
function openAuthModal(type) {
    document.getElementById('modalTitle').innerText = type === 'login' ? 'Đăng Nhập Hệ Thống' : 'Đăng Ký Thành Viên';
    document.getElementById('authModal').style.display = 'block';
    document.getElementById('overlay').style.display = 'block';
    switchForm(type);
}

function closeAuthModal() {
    document.getElementById('authModal').style.display = 'none';
    document.getElementById('overlay').style.display = 'none';
}

// 2. CHUYỂN ĐỔI QUA LẠI GIỮA FORM ĐĂNG NHẬP & ĐĂNG KÝ
function switchForm(formType) {
    document.getElementById("login-form").style.display = formType === 'login' ? 'block' : 'none';
    document.getElementById("register-form").style.display = formType === 'register' ? 'block' : 'none';
}

// 3. XỬ LÝ ĐĂNG NHẬP THÀNH CÔNG (Mở khóa hệ thống)
function handleAuth() {
    const formType = document.getElementById('login-form').style.display === 'block' ? 'login' : 'register';
    const form = formType === 'login' ? document.getElementById('login-form') : document.getElementById('register-form');
    const usernameInput = form.querySelector('input[type="text"]');
    const passwordInput = form.querySelector('input[type="password"]');
    const username = usernameInput ? usernameInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';

    if (!username || !password) {
        alert("Vui lòng nhập đầy đủ tên tài khoản và mật khẩu!");
        return;
    }

    if (formType === 'register') {
        alert("Đăng ký tài khoản mới đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.");
        return;
    }

    const encodedPassword = btoa(password);
    const user = userAccounts.find(u => u.username === username);
    if (!user || user.password !== encodedPassword) {
        alert("Tên tài khoản hoặc mật khẩu không đúng!");
        return;
    }

    isLoggedIn = true;
    currentUser = user;
    document.getElementById('userStatus').innerHTML = `Trạng thái: <span class="badge badge-success">Thành viên: ${username} - ${user.department} (Đang hoạt động)</span>`;
    document.getElementById('authButtons').innerHTML = '<button onclick="handleLogout()" class="btn btn-danger btn-xs">Đăng Xuất</button>';

    document.getElementById('sectionGiaoViec').classList.remove('disabled-section');
    document.getElementById('sectionXuLy').classList.remove('disabled-section');

    closeAuthModal();
    renderAllTables();
}

// 4. XỬ LÝ ĐĂNG XUẤT (Khóa hệ thống)
function handleLogout() {
    isLoggedIn = false;
    currentUser = null;
    document.getElementById('userStatus').innerHTML = 'Trạng thái: <span class="badge">Khách (Chỉ xem Bảng Theo Dõi)</span>';
    document.getElementById('authButtons').innerHTML = `
        <button onclick="openAuthModal('login')" class="btn btn-primary btn-xs" style="margin-right: 5px;">Đăng Nhập</button>
        <button onclick="openAuthModal('register')" class="btn btn-outline btn-xs">Đăng Ký</button>
    `;
    
    document.getElementById('sectionGiaoViec').classList.add('disabled-section');
    document.getElementById('sectionXuLy').classList.add('disabled-section');
    
    renderAllTables();
}

// 5. HÀNH ĐỘNG 1: TẠO CÔNG VIỆC MỚI (BẢNG GIAO VIỆC)
function taoCongViec() {
    if (!isLoggedIn) return;
    
    const MaDanhBoStr = document.getElementById('inputMaDanhBo').value.trim();
    if (MaDanhBoStr.length !== 11 || isNaN(MaDanhBoStr)) {
        alert("Mã danh bộ bắt buộc phải nhập đúng dạng số và đủ 11 chữ số!");
        return;
    }
    
    const today = new Date().toISOString().split('T')[0]; 
    const fileInput = document.getElementById('inputAnhDongHo');
    
    // Khởi tạo khung dữ liệu cơ bản
    const newJob = {
        stt: dbCongViec.length + 1,
        MaDanhBo: MaDanhBoStr,
        SoThan: document.getElementById('inputSoThan').value.trim(),
        AnhDongHo: "https://placeholder.com", // Mặc định nếu không đọc được ảnh
        ViecGiao: document.getElementById('inputViecGiao').value.trim(),
        NgayGiao: today,
        BoPhan: document.getElementById('inputBoPhan').value,
        thongTinXuLy: "",
        AnhCongTac: "",
        hoanThanh: false,
        phanHoiKetQua: ""
    };

    // 📸 MÃ HÓA ẢNH ĐỒNG HỒ SANG BASE64 TRƯỚC KHI LƯU
    if (fileInput && fileInput.files && fileInput.files[0]) {
        const file = fileInput.files[0];
        if (!validateImage(file)) return;
        const reader = new FileReader();
        reader.onload = function (e) {
            newJob.AnhDongHo = e.target.result; // Chuỗi mã hóa Base64 của ảnh
            dbCongViec.push(newJob);
            luuVaoLocalStorage();
            document.getElementById('formGiaoViec').reset();
            renderAllTables();
        };
        reader.readAsDataURL(fileInput.files[0]);
    } else {
        dbCongViec.push(newJob);
        luuVaoLocalStorage();
        document.getElementById('formGiaoViec').reset();
        renderAllTables();
    }
}

// 6. HÀNH ĐỘNG 2: CẬP NHẬT TRỰC TIẾP Ô TEXTAREA (BẢNG XỬ LÝ)
function capNhatXuLy(index, key, value) {
    dbCongViec[index][key] = value; 
    luuVaoLocalStorage();
    renderAllTables(); 
}

// 7. HÀNH ĐỘNG 3: UPLOAD VÀ MÃ HÓA ẢNH MINH CHỨNG (BẢNG XỬ LÝ)
function capNhatAnhCongTac(index, inputElement) {
    if (inputElement.files && inputElement.files[0]) {
        const file = inputElement.files[0];
        if (!validateImage(file)) return;
        const reader = new FileReader();
        reader.onload = function (e) {
            dbCongViec[index].AnhCongTac = e.target.result; // Lưu ảnh dạng Base64
            luuVaoLocalStorage();
            renderAllTables();
        };
        reader.readAsDataURL(inputElement.files[0]);
    }
}

// 8. HÀNH ĐỘNG 4: XÁC NHẬN HOÀN THÀNH BIỂU MẪU
function xacNhanHoanThanh(index) {
    dbCongViec[index].hoanThanh = true;
    dbCongViec[index].phanHoiKetQua = "Hệ thống đã ghi nhận xử lý!"; 
    luuVaoLocalStorage();
    renderAllTables();
}

// 9. HÀNH ĐỘNG 5: XÓA DÒNG CÔNG VIỆC KHI ĐÃ XỬ LÝ XONG
function xoaDongCongViec(index) {
    if (confirm("Bạn có chắc chắn muốn xóa dòng công việc này không?")) {
        dbCongViec.splice(index, 1);
        dbCongViec.forEach((item, i) => item.stt = i + 1);
        luuVaoLocalStorage();
        renderAllTables();
    }
}




// --- HÀNH ĐỘNG NÂNG CẤP: GIAO VIỆC BẰNG FILE KÈM ALBUM ẢNH HÀNG LOẠT (ĐÃ VÁ LỖI LƯU BỘ NHỚ) ---
async function giaoViecKemAnhHangLoat() {
    if (!isLoggedIn) return;
    
    const fileInput = document.getElementById('inputGiaoViecFile');
    const albumInput = document.getElementById('inputGiaoViecAlbum');
    
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        alert("Vui lòng chọn file dữ liệu mẫu (.csv) trước!");
        return;
    }

    const mapAnhDongHo = {}; 
    
    if (albumInput && albumInput.files && albumInput.files.length > 0) {
        const imageFiles = Array.from(albumInput.files).filter(f => validateImage(f));
        const fileImagePromises = imageFiles.map(fileAnh => {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = function (e) {
                    const tenFileKhongDuoi = fileAnh.name.substring(0, fileAnh.name.lastIndexOf('.')).trim();
                    mapAnhDongHo[tenFileKhongDuoi] = e.target.result;
                    resolve();
                };
                reader.readAsDataURL(fileAnh);
            });
        });
        await Promise.all(fileImagePromises);
    }

    const fileCSV = fileInput.files[0]; // Sửa lỗi lấy mảng file của trình duyệt
    const csvReader = new FileReader();

    csvReader.onload = function (e) {
        const text = e.target.result;
        const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        
        if (lines.length <= 1) {
            alert("File CSV trống hoặc không có dữ liệu hàng!");
            return;
        }

        const today = new Date().toISOString().split('T')[0];
        let soLuongThanhCong = 0;
        let soLuongCoAnh = 0;

        for (let i = 1; i < lines.length; i++) {
            const columns = lines[i].split(',');
            const MaDanhBoStr = columns[0] ? columns[0].trim() : "";
            
            if (MaDanhBoStr.length === 11 && !isNaN(MaDanhBoStr)) {
                
                let anhKhopDuoc = "https://placeholder.com"; 
                if (mapAnhDongHo[MaDanhBoStr]) {
                    anhKhopDuoc = mapAnhDongHo[MaDanhBoStr];
                    soLuongCoAnh++;
                }

                const newJob = {
                    stt: dbCongViec.length + 1,
                    MaDanhBo: MaDanhBoStr,
                    SoThan: columns[1] ? columns[1].trim() : "",
                    AnhDongHo: anhKhopDuoc, 
                    ViecGiao: columns[2] ? columns[2].trim() : "Xử lý theo danh sách file",
                    NgayGiao: today,
                    BoPhan: columns[3] ? columns[3].trim() : "Đội QLGT",
                    thongTinXuLy: "",
                    AnhCongTac: "",
                    hoanThanh: false,
                    phanHoiKetQua: ""
                };
                
                dbCongViec.push(newJob);
                soLuongThanhCong++;
            }
        }

        if (soLuongThanhCong > 0) {
            // Lưu dữ liệu (LocalStorage fallback hoặc OneDrive tùy theo trạng thái đăng nhập)
            luuVaoLocalStorage();
            
            // Vẽ lại giao diện bảng
            renderAllTables();
            
            // Reset các ô chọn file về trống
            fileInput.value = "";
            if (albumInput) albumInput.value = "";
            
            alert(`Thành công! Đã nạp ${soLuongThanhCong} công việc. Khớp tự động thành công ${soLuongCoAnh} hình ảnh tương ứng!`);
        } else {
            alert("Không nạp được dữ liệu. Kiểm tra lại định dạng Mã danh bộ trong file!");
        }
    };

    csvReader.readAsText(fileCSV, "UTF-8");
}




// --- CẤU HÌNH BIẾN SẮP XẾP TOÀN CỤC ---
let currentSortColumn = 'stt'; // Cột mặc định ban đầu là STT
let isSortAscending = true;     // Mặc định ban đầu xếp tăng dần (true)

// Hàm xử lý khi người dùng click vào tiêu đề cột
function thucHienSapXep(columnKey) {
    // Nếu click lại đúng cột cũ -> đảo chiều tăng/giảm. Nếu click cột mới -> đặt mặc định tăng dần
    if (currentSortColumn === columnKey) {
        isSortAscending = !isSortAscending;
    } else {
        currentSortColumn = columnKey;
        isSortAscending = true;
    }
    
    // Thực hiện sắp xếp mảng gốc dbCongViec dựa vào giá trị cột được chọn
    dbCongViec.sort((a, b) => {
        let valA = a[columnKey];
        let valB = b[columnKey];

        // Ép dữ liệu về dạng chữ viết thường nếu là chuỗi để so sánh chính xác
        if (typeof valA === 'string') valA = valA.trim().toLowerCase();
        if (typeof valB === 'string') valB = valB.trim().toLowerCase();

        // Xử lý logic so sánh tăng hoặc giảm dần
        if (valA < valB) return isSortAscending ? -1 : 1;
        if (valA > valB) return isSortAscending ? 1 : -1;
        return 0;
    });

    // Vẽ lại bảng ngay lập tức sau khi sắp xếp xong
    renderAllTables();
}




// --- HÀM ĐỔ DỮ LIỆU ĐỒNG BỘ LÊN GIAO DIỆN BẢNG (ĐÃ TÍCH HỢP BỘ LỌC) ---
function renderAllTables() {
    const tbodyXuLy = document.getElementById('tbodyXuLy');
    const tbodyTheoDoi = document.getElementById('tbodyTheoDoi');
    if (!tbodyXuLy || !tbodyTheoDoi) return;

    tbodyXuLy.innerHTML = "";
    tbodyTheoDoi.innerHTML = "";

    // 1. LẤY GIÁ TRỊ TỪ CÁC Ô BỘ LỌC TRÊN GIAO DIỆN (Nếu có)
    const keyword = document.getElementById('filterKeyword') ? document.getElementById('filterKeyword').value.trim().toLowerCase() : "";
    const filterBoPhan = document.getElementById('filterBoPhan') ? document.getElementById('filterBoPhan').value : "ALL";
    const filterTrangThai = document.getElementById('filterTrangThai') ? document.getElementById('filterTrangThai').value : "ALL";

    dbCongViec.forEach((job, index) => {
        
        // 2. LOGIC KIỂM TRA ĐIỀU KIỆN LỌC
        const matchKeyword = job.MaDanhBo.toLowerCase().includes(keyword) || 
                             job.SoThan.toLowerCase().includes(keyword) || 
                             job.ViecGiao.toLowerCase().includes(keyword);
                             
        const matchBoPhan = filterBoPhan === "ALL" || job.BoPhan === filterBoPhan || job.BoPhan.includes(filterBoPhan);
        
        const matchTrangThai = filterTrangThai === "ALL" || 
                               (filterTrangThai === "DONE" && job.hoanThanh) || 
                               (filterTrangThai === "PROCESSING" && !job.hoanThanh);

        // Nếu không thỏa mãn bất kỳ bộ lọc nào thì bỏ qua không hiển thị dòng này
        if (!matchKeyword || !matchBoPhan || !matchTrangThai) return;

        // --- A. BẢNG XỬ LÝ CÔNG VIỆC ---
        const duDieuKienHoanThanh = job.thongTinXuLy.trim() !== "" && job.AnhCongTac !== "";
        const trXuLy = document.createElement('tr');
        trXuLy.innerHTML = `
            <td><strong>${job.MaDanhBo}</strong></td>
            <td>${job.SoThan}</td>
            <td><img src="${job.AnhDongHo}" width="50" height="50" style="object-fit:cover; border-radius:4px;"></td>
            <td>${job.ViecGiao}</td>
            <td>${job.BoPhan}</td>
            <td>
                <textarea rows="2" class="form-control" style="resize:none;" placeholder="Nhập ghi chú kết quả..." onchange="capNhatXuLy(${index}, 'thongTinXuLy', this.value)">${job.thongTinXuLy}</textarea>
            </td>
            <td>
                ${job.AnhCongTac ? `<img src="${job.AnhCongTac}" width="50" height="50" style="object-fit:cover; display:block; margin-bottom:5px; border-radius:4px;">` : ''}
                <input type="file" accept="image/*" style="font-size:11px; width: 100%;" onchange="capNhatAnhCongTac(${index}, this)">
            </td>
            <td>
                <button class="btn btn-success btn-xs" ${(!duDieuKienHoanThanh || job.hoanThanh) ? 'disabled' : ''} onclick="xacNhanHoanThanh(${index})">
                    ${job.hoanThanh ? '✓ Đã Xong' : 'Hoàn Thành'}
                </button>
            </td>
        `;
        tbodyXuLy.appendChild(trXuLy);

        // --- B. BẢNG THEO DÕI CÔNG KHAI ---
        const dotClass = job.hoanThanh ? 'status-done' : 'status-processing';
        const textTrangThai = job.hoanThanh ? 'Đã Hoàn Thành' : 'Đang Xử Lý';
        const trTheoDoi = document.createElement('tr');
        trTheoDoi.innerHTML = `
            <td>${job.stt}</td>
            <td>${job.MaDanhBo}</td>
            <td>${job.SoThan}</td>
            <td><img src="${job.AnhDongHo}" width="40" height="40" style="object-fit:cover; border-radius:4px;"></td>
            <td>${job.ViecGiao}</td>
            <td>${job.NgayGiao}</td>
            <td><span class="badge" style="background-color: #0dcaf0; color:#333;">${job.BoPhan}</span></td>
            <td>
                <span class="status-dot ${dotClass}"></span>
                <span style="font-size:13px; font-weight:600;">${textTrangThai}</span>
            </td>
            <td>
                <i style="color:#666">${job.phanHoiKetQua ? job.phanHoiKetQua : 'Chờ bộ phận xử lý...'}</i>
            </td>
            <td>
                <button class="btn btn-danger btn-xs" ${(!job.hoanThanh || !isLoggedIn || !currentUser || currentUser.role !== 'admin') ? 'disabled' : ''} onclick="xoaDongCongViec(${index})">
                    Xóa
                </button>
            </td>
        `;
        tbodyTheoDoi.appendChild(trTheoDoi);
    });
}











// --- HÀNH ĐỘNG BỔ SUNG: XUẤT TOÀN BỘ DỮ LIỆU RA FILE EXCEL (CSV) ---
function xuatDuLieuExcel() {
    if (dbCongViec.length === 0) {
        alert("Hiện tại hệ thống không có dữ liệu dữ liệu để xuất file!");
        return;
    }

    // Định nghĩa dòng tiêu đề cột trong file Excel
    let csvContent = "STT,Mã Danh Bộ,Số Thân,Việc Giao,Ngày Giao,Bộ Phận,Trạng Thái,Ghi Chú Xử Lý\n";

    // Duyệt qua từng công việc để chuyển thành từng dòng text văn bản
    dbCongViec.forEach((job) => {
        const trangThaiText = job.hoanThanh ? "Đã Hoàn Thành" : "Đang Xử Lý";
        // Loại bỏ dấu phẩy trong văn bản ghi chú (nếu có) để tránh lệch cột CSV
        const viecGiaoClean = job.ViecGiao.replace(/,/g, "-");
        const ghiChuClean = job.thongTinXuLy.replace(/,/g, "-");

        csvContent += `${job.stt},"${job.MaDanhBo}","${job.SoThan}",${viecGiaoClean},${job.NgayGiao},${job.BoPhan},${trangThaiText},${ghiChuClean}\n`;
    });

    // Tạo đối tượng tải file và ép cấu trúc hiển thị chữ tiếng Việt không lỗi font (UTF-8 BOM)
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        // Tên file tải về tự động kèm ngày hiện tại
        const todayStr = new Date().toISOString().split('T')[0];
        link.setAttribute("download", `BaoCao_TheoDoiCongViec_${todayStr}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}




// Tự động tải lại dữ liệu khi mở trang web hoặc F5 (ĐÃ SỬA LỖI MẤT DỮ LIỆU)
window.onload = function() {
    // Nạp lại mảng từ LocalStorage nếu có, tránh trường hợp mảng bị reset về rỗng []
    dbCongViec = JSON.parse(localStorage.getItem('dbCongViec_Data')) || [];
    
    // Tiến hành vẽ dữ liệu lên 2 bảng
    renderAllTables();
};