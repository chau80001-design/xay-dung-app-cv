// ==========================================
// 1. IMPORT CÁC THƯ VIỆN FIREBASE CẦN THIẾT
// ==========================================
import { initializeApp, getApp, getApps } from "firebase/app";
import { 
    getAuth, 
    onAuthStateChanged, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut 
} from "firebase/auth";
import { 
    getFirestore, 
    doc, 
    getDoc, 
    setDoc 
} from "firebase/firestore";

// ==========================================
// 2. CẤU HÌNH & KHỞI TẠO ĐƠN ENTIY FIREBASE (SINGLETON)
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyCY55K9lbtUZBcw_338HsNakN-u5_905p8",
    authDomain: "app-qlcv-92e58.firebaseapp.com",
    projectId: "app-qlcv-92e58",
    storageBucket: "app-qlcv-92e58.firebasestorage.app",
    messagingSenderId: "315425543087",
    appId: "1:315425543087:web:16ac677bcdf1ab1175d55a",
    measurementId: "G-H428L4JGGJ"
};

// Khởi tạo một lần duy nhất tránh trùng lặp ứng dụng
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);

// ==========================================
// 3. ĐỊNH NGHĨA BIẾN TOÀN CỤC HỆ THỐNG
// ==========================================
let dbCongViec = [];      // Mảng lưu trữ danh sách công việc chính
let currentUser = null;   // Đối tượng người dùng hiện tại
let isLoggedIn = false;   // Trạng thái đăng nhập của ứng dụng

let currentSortColumn = 'stt'; 
let isSortAscending = true;

// Thẻ định danh vị trí lưu trữ Firestore
const FIREBASE_COLLECTION = "duLieuUngDung";
const FIREBASE_DOC_ID = "dbCongViec";

// ==========================================
// 4. LẮNG NGHE & KHÔI PHỤC PHIÊN ĐĂNG NHẬP (F5)
// ==========================================
onAuthStateChanged(auth, async (user) => {
    // Nạp nhanh dữ liệu tạm thời từ LocalStorage để tối ưu UI lúc khởi động
    dbCongViec = JSON.parse(localStorage.getItem('dbCongViec_Data')) || [];
    renderAllTables();

    if (user) {
        console.log("Tìm thấy phiên đăng nhập cũ:", user.email);
        isLoggedIn = true;
        currentUser = user;

        // Cơ chế phân quyền nhanh từ email (Có thể đổi tài khoản admin của bạn tại đây)
        currentUser.role = (user.email === 'chau800001@gmail.com') ? 'admin' : 'staff';

        // Cập nhật giao diện thanh trạng thái đăng nhập
        document.getElementById('userStatus').innerHTML = `Trạng thái: <span class="badge badge-success">Thành viên: ${user.email} (Đang hoạt động)</span>`;
        document.getElementById('authButtons').innerHTML = `<button id="btnLogOut" class="btn btn-danger btn-xs">Đăng Xuất</button>`;
        
        // Gắn sự kiện nút đăng xuất động
        document.getElementById('btnLogOut').addEventListener('click', handleLogout);

        // Mở khóa phân hệ chức năng nhập/sửa dữ liệu
        document.getElementById('sectionGiaoViec').classList.remove('disabled-section');
        document.getElementById('sectionXuLy').classList.remove('disabled-section');

        // Tải dữ liệu chính thức thời gian thực từ đám mây xuống
        await taiDuLieuTuFirebase();
    } else {
        console.log("Người dùng đang ở chế độ Khách (Vãng lai)");
        isLoggedIn = false;
        currentUser = null;
    }
});

// ==========================================
// 5. CÁC HÀM XỬ LÝ ĐỒNG BỘ DỮ LIỆU ĐÁM MÂY
// ==========================================

// Hàm đẩy toàn bộ mảng dữ liệu lên Cloud
async function luuVaoFirebase() {
    localStorage.setItem('dbCongViec_Data', JSON.stringify(dbCongViec));

    if (!auth.currentUser) {
        console.warn("Chưa đăng nhập! Dữ liệu chỉ cập nhật tạm thời ở client.");
        return;
    }
    try {
        const docRef = doc(db, FIREBASE_COLLECTION, FIREBASE_DOC_ID);
        // Đẩy cả mảng gọn gàng mà không cần JSON.stringify
        await setDoc(docRef, { danhSachMang: dbCongViec }); 
        console.log("Đã đồng bộ lên Firebase Firestore!");
    } catch (error) {
        console.error("Lỗi đồng bộ Firestore:", error);
    }
}

// Hàm tải dữ liệu từ Cloud về máy khi mở app
async function taiDuLieuTuFirebase() {
    if (!auth.currentUser) return;
    try {
        const docRef = doc(db, FIREBASE_COLLECTION, FIREBASE_DOC_ID);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            console.log("Chưa tồn tại dữ liệu trên Cloud, khởi tạo mảng rỗng...");
            dbCongViec = [];
            await luuVaoFirebase();
        } else {
            // Đọc mảng cấu trúc Object được bọc bên trong Document
            dbCongViec = docSnap.data().danhSachMang || [];
            console.log("Đã cập nhật dữ liệu từ đám mây thành công!", dbCongViec);
        }
        renderAllTables();
    } catch (error) {
        console.error("Lỗi nạp dữ liệu từ Cloud:", error);
    }
}

// ==========================================
// 6. LOGIC ĐÓNG MỞ MODAL & XÁC THỰC TÀI KHOẢN
// ==========================================
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

function switchForm(formType) {
    document.getElementById("login-form").style.display = formType === 'login' ? 'block' : 'none';
    document.getElementById("register-form").style.display = formType === 'register' ? 'block' : 'none';
}

// Hàm điều hướng xử lý sự kiện nút Xác nhận Form
async function handleAuth() {
    const formType = document.getElementById('login-form').style.display === 'block' ? 'login' : 'register';
    const form = formType === 'login' ? document.getElementById('login-form') : document.getElementById('register-form');
    
    const usernameInput = form.querySelector('input[type="text"]');
    const passwordInput = form.querySelector('input[type="password"]');
    
    const email = usernameInput ? usernameInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';

    if (!email || !password) {
        alert("Vui lòng điền đầy đủ email tài khoản và mật khẩu!");
        return;
    }

    try {
        if (formType === 'register') {
            await createUserWithEmailAndPassword(auth, email, password);
            alert("Đăng ký tài khoản thành công!");
        } else {
            await signInWithEmailAndPassword(auth, email, password);
        }
        closeAuthModal();
    } catch (error) {
        console.error("Lỗi Auth:", error.code);
        if (error.code === 'auth/invalid-credential') alert("Sai email hoặc mật khẩu!");
        else if (error.code === 'auth/email-already-in-use') alert("Email này đã có người đăng ký!");
        else alert("Lỗi hệ thống: " + error.message);
    }
}

async function handleLogout() {
    try {
        await signOut(auth);
        isLoggedIn = false;
        currentUser = null;

        document.getElementById('userStatus').innerHTML = 'Trạng thái: <span class="badge">Khách (Chỉ xem Bảng Theo Dõi)</span>';
        document.getElementById('authButtons').innerHTML = `
            <button onclick="openAuthModal('login')" class="btn btn-primary btn-xs" style="margin-right: 5px;">Đăng Nhập</button>
            <button onclick="openAuthModal('register')" class="btn btn-outline btn-xs">Đăng Ký</button>
        `;

        document.getElementById('sectionGiaoViec').classList.add('disabled-section');
        document.getElementById('sectionXuLy').classList.add('disabled-section');
        
        dbCongViec = [];
        renderAllTables();
    } catch (error) {
        console.error("Đăng xuất thất bại:", error);
    }
}

// ==========================================
// 7. CÁC HÀM NGHIỆP VỤ TÁC VỤ CÔNG VIỆC
// ==========================================

// Thêm 1 công việc đơn lẻ
async function taoCongViec() {
    if (!isLoggedIn) return;

    const MaDanhBoStr = document.getElementById('inputMaDanhBo').value.trim();
    if (MaDanhBoStr.length !== 11 || isNaN(MaDanhBoStr)) {
        alert("Mã danh bộ bắt buộc phải nhập đúng dạng số và đủ 11 chữ số!");
        return;
    }
    const today = new Date().toISOString().split('T')[0];
    const imageUrl = document.getElementById('jobImageUrl').value.trim();
    const newJob = {
        stt: dbCongViec.length + 1,
        MaDanhBo: MaDanhBoStr,
        SoThan: document.getElementById('inputSoThan').value.trim(),
        AnhDongHo: imageUrl,
        ViecGiao: document.getElementById('inputViecGiao').value.trim(),
        NgayGiao: today,
        BoPhan: document.getElementById('inputBoPhan').value,
        thongTinXuLy: "",
        AnhCongTac: "",
        hoanThanh: false,
        phanHoiKetQua: ""
    };
    dbCongViec.push(newJob);
    await luuVaoFirebase();
    document.getElementById('formGiaoViec')?.reset();
    renderAllTables();
    alert("Thêm công việc thành công!");
}
// Sửa ghi chú văn bản trực tiếp
async function capNhatXuLy(index, key, value) {
    dbCongViec[index][key] = value;
    renderAllTables(); // Đảm bảo gõ chữ mượt mà ở client
    await luuVaoFirebase();
}
// Duyệt hoàn thành công việc
async function xacNhanHoanThanh(index) {
    dbCongViec[index].hoanThanh = true;
    dbCongViec[index].phanHoiKetQua = "Hệ thống đã ghi nhận xử lý!";
    renderAllTables();
    await luuVaoFirebase();
}
// Xóa dòng công việc
async function xoaDongCongViec(index) {
    if (confirm("Bạn có chắc chắn muốn xóa dòng công việc này không?")) {
        dbCongViec.splice(index, 1);
        dbCongViec.forEach((item, i) => item.stt = i + 1);
        renderAllTables();
        await luuVaoFirebase();
    }
}
// Nạp hàng loạt dữ liệu (Bulk CSV Upload)
async function giaoViecKemAnhHangLoat() {
    if (!isLoggedIn) return;
    const fileInput = document.getElementById('inputGiaoViecFile');
    if (!fileInput || !fileInput.files.length) {
        alert("Vui lòng chọn file CSV!");
        return;
    }
    const file = fileInput.files[0];
    try {
        const text = await file.text();
        Papa.parse(text, {
            header: false,
            skipEmptyLines: true,
            complete: async (results) => {
                const lines = results.data;
                const today = new Date().toISOString().split('T')[0];
                for (let i = 0; i < lines.length; i++) {
                    const parts = lines[i];
                    const maDanhBoStr = parts[0] ? parts[0].toString().trim() : '';
                    if (maDanhBoStr.length !== 11 || isNaN(maDanhBoStr)) {
                        continue;
                    }
                    dbCongViec.push({
                        stt: dbCongViec.length + 1,
                        MaDanhBo: maDanhBoStr,
                        SoThan: parts[1] ? parts[1].toString().trim() : '',
                        AnhDongHo: "",
                        ViecGiao: parts[2] ? parts[2].toString().trim() : 'Xử lý rò rỉ / cập nhật chỉ số',
                        NgayGiao: today,
                        BoPhan: parts[3] ? parts[3].toString().trim() : 'Đội Quản Lý',
                        thongTinXuLy: "",
                        AnhCongTac: "",
                        hoanThanh: false,
                        phanHoiKetQua: ""
                    });
                }
                await luuVaoFirebase();
                fileInput.value = "";
                renderAllTables();
                alert(`Nạp ${lines.length} dòng thành công!`);
            }
        });
    } catch (err) {
        console.error(err);
        alert("Lỗi đọc file CSV!");
    }
}
// Sắp xếp cột dữ liệu tại client
function thucHienSapXep(columnKey) {
    if (currentSortColumn === columnKey) {
        isSortAscending = !isSortAscending;
    } else {
        currentSortColumn = columnKey;
        isSortAscending = true;
    }
    dbCongViec.sort((a, b) => {
        let valA = a[columnKey];
        let valB = b[columnKey];
        if (typeof valA === 'string') valA = valA.trim().toLowerCase();
        if (typeof valB === 'string') valB = valB.trim().toLowerCase();
        if (valA < valB) return isSortAscending ? -1 : 1;
        if (valA > valB) return isSortAscending ? 1 : -1;
        return 0;
    });
    renderAllTables();
}
// Export báo cáo dữ liệu CSV Excel
function xuatDuLieuExcel() {
    if (dbCongViec.length === 0) {
        alert("Hiện tại hệ thống không có dữ liệu để xuất file!");
        return;
    }
    let csvContent = "STT,Mã Danh Bộ,Số Thân,Việc Giao,Ngày Giao,Bộ Phận,Trạng Thái,Ghi Chú Xử Lý\n";
    dbCongViec.forEach((job) => {
        const trangThaiText = job.hoanThanh ? "Đã Hoàn Thành" : "Đang Xử Lý";
        const viecGiaoClean = job.ViecGiao.replace(/,/g, "-");
        const ghiChuClean = job.thongTinXuLy.replace(/,/g, "-");
        csvContent += `${job.stt},"${job.MaDanhBo}","${job.SoThan}","${viecGiaoClean}","${job.NgayGiao}","${job.BoPhan}","${trangThaiText}","${ghiChuClean}"\n`;
    });
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        const todayStr = new Date().toISOString().split('T')[0];
        link.setAttribute("download", `BaoCao_TheoDoiCongViec_${todayStr}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}
// ==========================================
// 8. HÀM VẼ GIAO DIỆN CHÍNH (RENDER TABLES)
// ==========================================
function renderAllTables() {
    const tbodyXuLy = document.getElementById('tbodyXuLy');
    const tbodyTheoDoi = document.getElementById('tbodyTheoDoi');
    if (!tbodyXuLy || !tbodyTheoDoi) return;
    tbodyXuLy.innerHTML = "";
    tbodyTheoDoi.innerHTML = "";
    const keyword = document.getElementById('filterKeyword') ? document.getElementById('filterKeyword').value.trim().toLowerCase() : "";
    const filterBoPhan = document.getElementById('filterBoPhan') ? document.getElementById('filterBoPhan').value : "ALL";
    const filterTrangThai = document.getElementById('filterTrangThai') ? document.getElementById('filterTrangThai').value : "ALL";
    
    console.log('🔍 renderAllTables:', { total: dbCongViec.length, keyword, filterBoPhan, filterTrangThai });
    
    let rendered = 0;
    dbCongViec.forEach((job, index) => {
        const matchKeyword = job.MaDanhBo.toLowerCase().includes(keyword) ||
            job.SoThan.toLowerCase().includes(keyword) ||
            job.ViecGiao.toLowerCase().includes(keyword);
        const matchBoPhan = filterBoPhan === "ALL" || job.BoPhan === filterBoPhan || job.BoPhan.includes(filterBoPhan);
        const matchTrangThai = filterTrangThai === "ALL" ||
            (filterTrangThai === "DONE" && job.hoanThanh) ||
            (filterTrangThai === "PROCESSING" && !job.hoanThanh);
        if (!matchKeyword || !matchBoPhan || !matchTrangThai) return;
        rendered++;
// --- A. VẼ BẢNG XỬ LÝ ---
        const trXuLy = document.createElement('tr');
        trXuLy.innerHTML = `
            <td>${job.MaDanhBo}</td>
            <td>${job.SoThan}</td>
            <td>${job.AnhDongHo ? `<img src="${job.AnhDongHo}" width="50" height="50" style="object-fit:cover; border-radius:4px;">` : 'N/A'}</td>
            <td>${job.ViecGiao}</td>
            <td>${job.BoPhan}</td>
            <td style="width: 25%;">
                <input type="text" value="${job.thongTinXuLy || ''}" onchange="capNhatXuLy(${index}, 'thongTinXuLy', this.value)" placeholder="Ghi chú xử lý (có thể dán link ảnh)..." style="width:100%;">
            </td>
            <td style="width: 20%;">
                ${job.AnhCongTac ? `<img src="${job.AnhCongTac}" width="50" height="50" style="object-fit:cover; display:block; margin-bottom:5px; border-radius:4px;">` : 'N/A'}
            </td>
            <td>
                ${!job.hoanThanh ? `<button onclick="xacNhanHoanThanh(${index})" class="btn btn-success btn-xs">Hoàn Thành</button>` : '<span class="badge badge-success">Đã xong</span>'}
                <button onclick="xoaDongCongViec(${index})" class="btn btn-danger btn-xs" style="margin-left:5px;">Xóa</button>
            </td>
        `;
        tbodyXuLy.appendChild(trXuLy);
        // --- B. VẼ BẢNG THEO DÕI ---
        const dotClass = job.hoanThanh ? 'status-done' : 'status-processing';
        const textTrangThai = job.hoanThanh ? 'Đã Hoàn Thành' : 'Đang Xử Lý';
        const trTheoDoi = document.createElement('tr');
        trTheoDoi.innerHTML = `
            <td>${job.stt}</td>
            <td>${job.MaDanhBo}</td>
            <td>${job.SoThan}</td>
            <td>${job.AnhDongHo ? `<img src="${job.AnhDongHo}" width="50" height="50" style="object-fit:cover; border-radius:4px;">` : 'N/A'}</td>
            <td>${job.ViecGiao}</td>
            <td>${job.NgayGiao}</td>
            <td>${job.BoPhan}</td>
            <td><span class="status-dot ${dotClass}"></span> ${textTrangThai}</td>
            <td>${job.thongTinXuLy || ''}</td>
            <td>
                ${!job.hoanThanh ? `<button onclick="xacNhanHoanThanh(${index})" class="btn btn-success btn-xs">Hoàn Thành</button>` : '<span class="badge badge-success">Đã xong</span>'}
                <button onclick="xoaDongCongViec(${index})" class="btn btn-danger btn-xs" style="margin-left:5px;">Xóa</button>
            </td>
        `;
        tbodyTheoDoi.appendChild(trTheoDoi);
    });
    console.log(`✅ Rendered: ${rendered}/${dbCongViec.length} rows`);
}
// Đưa các hàm cần tương tác với HTML thẻ onClick ra môi trường Global (Window Window-Scope)
window.openAuthModal = openAuthModal;
window.closeAuthModal = closeAuthModal;
window.handleAuth = handleAuth;
window.handleLogout = handleLogout;
window.taoCongViec = taoCongViec;
window.capNhatXuLy = capNhatXuLy;
window.xacNhanHoanThanh = xacNhanHoanThanh;
window.xoaDongCongViec = xoaDongCongViec;
window.giaitrinhanhcongviec = giaoViecKemAnhHangLoat;
window.giaoViecKemAnhHangLoat = giaoViecKemAnhHangLoat;
window.thucHienSapXep = thucHienSapXep;
window.xuatDuLieuExcel = xuatDuLieuExcel;
