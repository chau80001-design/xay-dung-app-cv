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
import { 
    getStorage, 
    ref, 
    uploadBytes, 
    getDownloadURL 
} from "firebase/storage";

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
export const storage = getStorage(app);

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

    // Tải dữ liệu từ Firestore cho cả công khai và thành viên
    await taiDuLieuTuFirebase();

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
    } else {
        console.log("Người dùng đang ở chế độ Khách (Vãng lai) - Đã tải dữ liệu công khai");
        isLoggedIn = false;
        currentUser = null;
    }
});

// ==========================================
// 5. CÁC HÀM XỬ LÝ ĐỒNG BỘ DỮ LIỆU ĐÁM MÂY
// ==========================================

// Hàm tải dữ liệu từ Firestore (dành cho cả công khai và thành viên)
async function taiDuLieuTuFirebase() {
    try {
        const docRef = doc(db, FIREBASE_COLLECTION, FIREBASE_DOC_ID);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.danhSachMang && Array.isArray(data.danhSachMang)) {
                dbCongViec = data.danhSachMang;
                localStorage.setItem('dbCongViec_Data', JSON.stringify(dbCongViec));
                renderAllTables();
                console.log("Đã tải dữ liệu từ Firebase Firestore:", dbCongViec.length, "dòng");
            }
        } else {
            console.log("Chưa có dữ liệu trên Firestore");
        }
    } catch (error) {
        console.error("Lỗi tải dữ liệu từ Firestore:", error);
    }
}

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

// Hàm upload ảnh lên Firebase Storage
async function uploadAnhDongHo(file) {
    if (!file) return "";
    try {
        // Tạo tên file duy nhất tránh trùng
        const fileName = `${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
        const storageRef = ref(storage, `anh-dong-ho/${fileName}`);
        
        // Upload file với metadata để tối ưu
        const metadata = {
            contentType: 'image/jpeg',
            cacheControl: 'public, max-age=31536000'
        };
        
        // Upload file
        // Resize ảnh trước khi upload để tăng tốc
        let fileToUpload = file;
        const lowerName = file.name.toLowerCase();
        const isHeicJfif = lowerName.endsWith('.jfif') || lowerName.endsWith('.heic') || lowerName.endsWith('.heif');
        if (file.type.startsWith('image/') || lowerName.endsWith('.jfif') || lowerName.endsWith('.heic') || lowerName.endsWith('.heif') || lowerName.endsWith('.jpeg') || lowerName.endsWith('.jpg') || lowerName.endsWith('.png') || lowerName.endsWith('.webp') || file.type.includes('octet-stream')) {
            try {
                // For JFIF/HEIC/HEIF, upload as-is (no compression attempt via canvas to avoid issues)
                if (lowerName.endsWith('.jfif') || lowerName.endsWith('.heic') || lowerName.endsWith('.heif')) {
                    fileToUpload = file;
                } else {
                    const compressedFile = await compressImage(file, 800, 0.7);
                    if (compressedFile) {
                        fileToUpload = compressedFile;
                    }
                }
            } catch (e) {
                console.warn('Không thể xử lý ảnh, upload nguyên bản:', e);
                fileToUpload = file;
            }
        } else {
            fileToUpload = file;
        }

        const snapshot = await uploadBytes(storageRef, fileToUpload, metadata);
        
        // Lấy URL download
        const downloadURL = await getDownloadURL(snapshot.ref);
        return downloadURL;
    } catch (error) {
        console.error("Lỗi upload ảnh:", error);
        alert("Upload ảnh thất bại: " + error.message);
        return "";
    }
}

// Hàm nén ảnh trước khi upload để tăng tốc upload
function compressImage(file, maxWidth = 800, quality = 0.7) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                // Tính toán kích thước mới theo maxWidth
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
                
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Chuyển canvas thành blob
                canvas.toBlob((blob) => {
                    if (blob) {
                        // Tạo File mới từ blob
                const compressedFile = new File([blob], file.name.replace(/\.jfif$/i, '.jpg').replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg'), {
                    type: 'image/jpeg',
                    lastModified: Date.now()
                });
                        resolve(compressedFile);
                    } else {
                        resolve(null);
                    }
                }, 'image/jpeg', quality);
            };
            img.onerror = () => resolve(null);
        };
        reader.onerror = () => resolve(null);
    });
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
        console.error("Lỗi Auth:", error.code, error.message);
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
            alert("Sai email hoặc mật khẩu!");
        } else if (error.code === 'auth/invalid-email') {
            alert("Email không hợp lệ! Vui lòng nhập đúng định dạng email.");
        } else if (error.code === 'auth/email-already-in-use') {
            alert("Email này đã được đăng ký!");
        } else if (error.code === 'auth/weak-password') {
            alert("Mật khẩu quá yếu! Cần ít nhất 6 ký tự.");
        } else if (error.code === 'auth/too-many-requests') {
            alert("Đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau vài phút!");
        } else if (error.code === 'auth/network-request-failed') {
            alert("Lỗi kết nối mạng! Kiểm tra internet của bạn.");
        } else {
            alert("Lỗi xác thực: " + error.message);
        }
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

        if (document.getElementById('sectionXuLy')) document.getElementById('sectionXuLy').classList.add('disabled-section');
        
        dbCongViec = [];
        renderAllTables();
    } catch (error) {
        console.error("Đăng xuất thất bại:", error);
    }
}

// ==========================================
// 6.5. HÀM MỞ BẢNG GIAO VIỆC TỪ NÚT TRÊN TRANG THEO DÕI
// ==========================================
function moBangGiaoViec() {
    // Điều hướng sang trang giao việc riêng biệt (không cần đăng nhập)
    window.location.href = 'giaoviec.html';
}

// ==========================================
// 6.6. HÀM MỞ BẢNG XỬ LÝ TỪ NÚT TRÊN TRANG THEO DÕI
// ==========================================
function moBangXuLy() {
    // Điều hướng sang trang xử lý công việc riêng biệt (không cần đăng nhập)
    window.location.href = 'xuly.html';
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
    const imageUrlInput = document.getElementById('jobImageUrl').value.trim();
    const imageFile = document.getElementById('jobImageFile')?.files[0];
    
    let imageUrlFinal = imageUrlInput;
    
    // Ưu tiên upload file ảnh nếu có chọn file
    if (imageFile) {
        // Hiển thị trạng thái đang upload
        const submitBtn = document.querySelector('#formGiaoViec button[type="submit"]');
        const oldText = submitBtn ? submitBtn.textContent : "⏳ Đang xử lý...";
        if (submitBtn) {
            submitBtn.textContent = "⏳ Đang upload ảnh...";
            submitBtn.disabled = true;
        }
        
        imageUrlFinal = await uploadAnhDongHo(imageFile);
        
        if (submitBtn) {
            submitBtn.textContent = oldText;
            submitBtn.disabled = false;
        }
        
        if (!imageUrlFinal) {
            alert("Không thể upload ảnh, vui lòng thử lại hoặc dùng link ảnh!");
            return;
        }
    }
    
    const newJob = {
        stt: dbCongViec.length + 1,
        dot: document.getElementById('inputDot')?.value.trim() || '',
        xa: document.getElementById('inputXa')?.value.trim() || '',
        MaDanhBo: MaDanhBoStr,
        thongTinKhachHang: document.getElementById('inputThongTinKH')?.value.trim() || '',
        sdtChuNha: document.getElementById('inputSdtChuNha')?.value.trim() || '',
        hieu: document.getElementById('inputHieu')?.value.trim() || '',
        co: document.getElementById('inputCo')?.value.trim() || '',
        dm: document.getElementById('inputDm')?.value.trim() || '',
        gb: document.getElementById('inputGb')?.value.trim() || '',
        SoThan: document.getElementById('inputSoThan').value.trim(),
        thongTinNVDocSo: document.getElementById('inputThongTinNV')?.value.trim() || '',
        noiDung: document.getElementById('inputViecGiao').value.trim(),
        ngayThucHien: today,
        AnhDongHo: imageUrlFinal,
        ViecGiao: document.getElementById('inputViecGiao').value.trim(),
        NgayGiao: today,
        BoPhan: document.getElementById('inputBoPhan').value,
        thongTinXuLy: "",
        AnhCongTac: "",
        hoanThanh: false,
        phanHoiKetQua: "",
        nguoiGiaoViec: currentUser ? currentUser.email : 'guest'
    };
    dbCongViec.push(newJob);
    await luuVaoFirebase();
    document.getElementById('formGiaoViec')?.reset();
    const previewImg = document.getElementById('previewImg');
    if (previewImg) {
        previewImg.style.display = "none";
        previewImg.src = "";
    }
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
    const job = dbCongViec[index];
    
    // Chỉ người giao việc mới được xóa (bất kể trạng thái)
    if (!currentUser || job.nguoiGiaoViec !== currentUser.email) {
        alert("Chỉ người giao việc (" + (job.nguoiGiaoViec || 'không rõ') + ") mới được xóa dòng công việc này!");
        return;
    }
    
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
                    const maDanhBoStr = parts[3] ? parts[3].toString().trim() : ''; // DANH BỘ ở cột 4 (index 3)
                    if (maDanhBoStr.length !== 11 || isNaN(maDanhBoStr)) {
                        continue;
                    }
                    dbCongViec.push({
                        stt: dbCongViec.length + 1,
                        dot: parts[0] ? parts[0].toString().trim() : '',
                        xa: parts[1] ? parts[1].toString().trim() : '',
                        MaDanhBo: maDanhBoStr,
                        thongTinKhachHang: parts[4] ? parts[4].toString().trim() : '',
                        sdtChuNha: parts[5] ? parts[5].toString().trim() : '',
                        hieu: parts[6] ? parts[6].toString().trim() : '',
                        co: parts[7] ? parts[7].toString().trim() : '',
                        dm: parts[8] ? parts[8].toString().trim() : '',
                        gb: parts[9] ? parts[9].toString().trim() : '',
                        SoThan: parts[10] ? parts[10].toString().trim() : '',
                        thongTinNVDocSo: parts[11] ? parts[11].toString().trim() : '',
                        noiDung: parts[12] ? parts[12].toString().trim() : '',
                        ngayThucHien: parts[13] ? parts[13].toString().trim() : today,
                        AnhDongHo: "",
                        ViecGiao: parts[12] ? parts[12].toString().trim() : 'Xử lý rò rỉ / cập nhật chỉ số',
                        NgayGiao: today,
                        BoPhan: 'Đội Quản Lý',
                        thongTinXuLy: "",
                        AnhCongTac: "",
                        hoanThanh: false,
                        phanHoiKetQua: "",
                        nguoiGiaoViec: currentUser ? currentUser.email : 'guest'
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
    let csvContent = "STT,ĐỢT,Xã,DANH BỘ,Thông tin KHÁCH HÀNG,SĐT chủ nhà,HIỆU,CỠ,ĐM,GB,SỐ THÂN,Thông tin NV đọc số,Nội dung,Ngày thực hiện\n";
    dbCongViec.forEach((job) => {
        const noiDungClean = (job.noiDung || job.thongTinXuLy || job.ViecGiao || '').replace(/,/g, "-");
        csvContent += `${job.stt},"${job.dot || ''}","${job.xa || ''}","${job.MaDanhBo}","${job.thongTinKhachHang || ''}","${job.sdtChuNha || ''}","${job.hieu || ''}","${job.co || ''}","${job.dm || ''}","${job.gb || ''}","${job.SoThan}","${job.thongTinNVDocSo || ''}","${noiDungClean}","${job.ngayThucHien || job.NgayGiao || ''}"\n`;
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

// Hàm tính tuần từ ngày thực hiện và trả về class màu
// Tuần 1: Vàng, Tuần 2: Xanh dương, Tuần 3: Cam, Tuần 4: Đỏ, Sau đó: Đen
function getWeekColorClass(dateStr) {
    if (!dateStr) return 'week-black';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 'week-black';
    
    // Lấy ngày đầu tiên của tháng
    const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    // Tính số ngày từ đầu tháng
    const diffDays = Math.floor((date - firstDayOfMonth) / (1000 * 60 * 60 * 24));
    // Tuần (0-indexed): 0-6 = tuần 1, 7-13 = tuần 2, 14-20 = tuần 3, 21-27 = tuần 4, 28+ = tuần 5+
    const weekIndex = Math.floor(diffDays / 7);
    
    switch (weekIndex) {
        case 0: return 'week-yellow';   // Tuần 1: Vàng
        case 1: return 'week-blue';     // Tuần 2: Xanh dương
        case 2: return 'week-orange';   // Tuần 3: Cam
        case 3: return 'week-red';      // Tuần 4: Đỏ
        default: return 'week-black';   // Tuần 5+: Đen
    }
}

function renderAllTables() {
    const tbodyXuLy = document.getElementById('tbodyXuLy');
    const tbodyTheoDoi = document.getElementById('tbodyTheoDoi');
    if (!tbodyXuLy && !tbodyTheoDoi) return;
    
    if (tbodyXuLy) tbodyXuLy.innerHTML = "";
    if (tbodyTheoDoi) tbodyTheoDoi.innerHTML = "";
    
    const keyword = document.getElementById('filterKeyword') ? document.getElementById('filterKeyword').value.trim().toLowerCase() : "";
    const filterBoPhan = document.getElementById('filterBoPhan') ? document.getElementById('filterBoPhan').value : "ALL";
    const filterTrangThai = document.getElementById('filterTrangThai') ? document.getElementById('filterTrangThai').value : "ALL";
    
    console.log('🔍 renderAllTables:', { total: dbCongViec.length, keyword, filterBoPhan, filterTrangThai });
    
    let rendered = 0;
    dbCongViec.forEach((job, index) => {
        const matchKeyword = (job.dot || '').toLowerCase().includes(keyword) ||
            (job.xa || '').toLowerCase().includes(keyword) ||
            (job.MaDanhBo || '').toLowerCase().includes(keyword) ||
            (job.thongTinKhachHang || '').toLowerCase().includes(keyword) ||
            (job.sdtChuNha || '').toLowerCase().includes(keyword) ||
            (job.hieu || '').toLowerCase().includes(keyword) ||
            (job.co || '').toLowerCase().includes(keyword) ||
            (job.dm || '').toLowerCase().includes(keyword) ||
            (job.gb || '').toLowerCase().includes(keyword) ||
            (job.SoThan || '').toLowerCase().includes(keyword) ||
            (job.thongTinNVDocSo || '').toLowerCase().includes(keyword) ||
            (job.noiDung || '').toLowerCase().includes(keyword) ||
            (job.ngayThucHien || '').toLowerCase().includes(keyword) ||
            (job.ViecGiao || '').toLowerCase().includes(keyword) ||
            (job.thongTinXuLy || '').toLowerCase().includes(keyword);
        const matchBoPhan = filterBoPhan === "ALL" || job.BoPhan === filterBoPhan || (job.BoPhan || '').includes(filterBoPhan);
        const matchTrangThai = filterTrangThai === "ALL" ||
            (filterTrangThai === "DONE" && job.hoanThanh) ||
            (filterTrangThai === "PROCESSING" && !job.hoanThanh);
        if (!matchKeyword || !matchBoPhan || !matchTrangThai) return;
        rendered++;
        // --- A. VẼ BẢNG XỬ LÝ ---
        if (tbodyXuLy) {
            const trXuLy = document.createElement('tr');
            
            // Admin được xóa tất cả, staff chỉ được xóa công việc mình giao
            const canDelete = currentUser && (currentUser.role === 'admin' || job.nguoiGiaoViec === currentUser.email);
            const deleteBtn = canDelete 
                ? `<button onclick="xoaDongCongViec(${index})" class="btn btn-danger btn-xs" style="margin-left:5px;">Xóa</button>`
                : `<span class="badge" style="background:#6c757d; margin-left:5px;">Chỉ ${job.nguoiGiaoViec || 'người giao'} được xóa</span>`;

            // Tính màu theo tuần từ ngày thực hiện
            const dateStrXuLy = job.ngayThucHien || job.NgayGiao || '';
            const weekColorClassXuLy = getWeekColorClass(dateStrXuLy);
            trXuLy.className = weekColorClassXuLy;

            trXuLy.innerHTML = `
                <td>${job.MaDanhBo || ''}</td>
                <td>${job.SoThan || ''}</td>
                <td>${job.AnhDongHo ? `<img src="${job.AnhDongHo}" width="50" height="50" style="object-fit:cover; border-radius:4px;">` : 'N/A'}</td>
                <td>${job.ViecGiao || ''}</td>
                <td>${job.BoPhan || ''}</td>
                <td style="width: 25%;">
                    <input type="text" value="${job.thongTinXuLy || ''}" onchange="capNhatXuLy(${index}, 'thongTinXuLy', this.value)" placeholder="Ghi chú xử lý (có thể dán link ảnh)..." style="width:100%;">
                </td>
                <td style="width: 20%;">
                    ${job.AnhCongTac ? `<img src="${job.AnhCongTac}" width="50" height="50" style="object-fit:cover; display:block; margin-bottom:5px; border-radius:4px;">` : 'N/A'}
                </td>
                <td>
                    ${!job.hoanThanh ? `<button onclick="xacNhanHoanThanh(${index})" class="btn btn-success btn-xs">Hoàn Thành</button>` : '<span class="badge badge-success">Đã xong</span>'}
                    ${deleteBtn}
                </td>
            `;
            tbodyXuLy.appendChild(trXuLy);
        }
        // --- B. VẼ BẢNG THEO DÕI ---
        if (tbodyTheoDoi) {
            const dotClass = job.hoanThanh ? 'status-done' : 'status-processing';
            const textTrangThai = job.hoanThanh ? 'Đã Hoàn Thành' : 'Đang Xử Lý';
            
            // Tính màu theo tuần từ ngày thực hiện
            const dateStr = job.ngayThucHien || job.NgayGiao || '';
            const weekColorClass = getWeekColorClass(dateStr);
            
            const trTheoDoi = document.createElement('tr');
            trTheoDoi.className = weekColorClass;
            trTheoDoi.innerHTML = `
                <td>${job.stt !== undefined ? job.stt : index + 1}</td>
                <td>${job.dot || ''}</td>
                <td>${job.xa || ''}</td>
                <td>${job.MaDanhBo || ''}</td>
                <td>${job.thongTinKhachHang || ''}</td>
                <td>${job.sdtChuNha || ''}</td>
                <td>${job.hieu || ''}</td>
                <td>${job.co || ''}</td>
                <td>${job.dm || ''}</td>
                <td>${job.gb || ''}</td>
                <td>${job.SoThan || ''}</td>
                <td>${job.thongTinNVDocSo || ''}</td>
                <td>${job.noiDung || job.thongTinXuLy || job.ViecGiao || ''}</td>
                <td>${dateStr}</td>
            `;
            tbodyTheoDoi.appendChild(trTheoDoi);
        }
    });
    console.log(`✅ Rendered: ${rendered}/${dbCongViec.length} rows`);
}

function bindFilterEvents() {
    const filterKeyword = document.getElementById('filterKeyword');
    const filterBoPhan = document.getElementById('filterBoPhan');
    const filterTrangThai = document.getElementById('filterTrangThai');
    if (filterKeyword) filterKeyword.addEventListener('input', renderAllTables);
    if (filterBoPhan) filterBoPhan.addEventListener('change', renderAllTables);
    if (filterTrangThai) filterTrangThai.addEventListener('change', renderAllTables);
}

// Xem trước ảnh khi chọn file
document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('jobImageFile');
    const previewImg = document.getElementById('previewImg');
    if (fileInput && previewImg) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    previewImg.src = e.target.result;
                    previewImg.style.display = "block";
                };
                reader.readAsDataURL(file);
            } else {
                previewImg.style.display = "none";
            }
        });
    }
    
    bindFilterEvents();
});

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
window.moBangGiaoViec = moBangGiaoViec;
window.moBangXuLy = moBangXuLy;
window.taiDuLieuTuFirebase = taiDuLieuTuFirebase;

