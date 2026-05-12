#include "runtime.h"

typedef struct { TscError _base; } FileError;
static FileError FileError_new(String msg) { FileError s = {0}; s._base.message = msg; return s; }

typedef struct { TscError _base; } NetworkError;
static NetworkError NetworkError_new(String msg) { NetworkError s = {0}; s._base.message = msg; return s; }

typedef enum { _Err_FileError = 0, _Err_NetworkError = 1 } _ErrTag_FileError_NetworkError;
typedef struct {
    _ErrTag_FileError_NetworkError tag;
    union { FileError _0; NetworkError _1; };
} _ErrUnion_FileError_NetworkError;

typedef struct {
    bool ok;
    union { int _dummy; _ErrUnion_FileError_NetworkError error; };
} Result_void_FileError_NetworkError;

Result_void_FileError_NetworkError risky_bool(bool flag) {
    if (flag) {
        _ErrUnion_FileError_NetworkError _err = {.tag = _Err_FileError, ._0 = FileError_new(STR_LIT("file"))};
        return (Result_void_FileError_NetworkError){.ok = false, .error = _err};
    } else {
        _ErrUnion_FileError_NetworkError _err = {.tag = _Err_NetworkError, ._1 = NetworkError_new(STR_LIT("net"))};
        return (Result_void_FileError_NetworkError){.ok = false, .error = _err};
    }
    return (Result_void_FileError_NetworkError){.ok = true};
}

int main(void) {
    TSC_INIT();
    Result_void_FileError_NetworkError _res_0 = risky_bool(true);
    if (!_res_0.ok) {
        if (_res_0.error.tag == _Err_FileError) {
            FileError e = _res_0.error._0;
            printf("file err\n");
        } else if (_res_0.error.tag == _Err_NetworkError) {
            NetworkError e = _res_0.error._1;
            printf("net err\n");
        }
    }
    return 0;
}
