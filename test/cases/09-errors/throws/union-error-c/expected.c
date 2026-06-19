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
    union { String value; _ErrUnion_FileError_NetworkError error; };
} Result_string_FileError_NetworkError;

Result_string_FileError_NetworkError fetch_string(String url) {
    _ErrUnion_FileError_NetworkError _err = {.tag = _Err_NetworkError, ._1 = NetworkError_new(STR_LIT("timeout"))};
    return (Result_string_FileError_NetworkError){.ok = false, .error = _err};
}

int main(void) {
    TSC_INIT();
    return 0;
}
