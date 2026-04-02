#include "runtime.h"

typedef struct { TscError _base; } IOError;
static IOError IOError_new(String msg) { IOError s = {0}; s._base.message = msg; return s; }

typedef struct { bool ok; union { String value; IOError error; }; } Result_string_IOError;

Result_string_IOError readFile_string(String path) {
    (void)path;
    return (Result_string_IOError){.ok = false, .error = IOError_new(STR_LIT("not found"))};
}

Result_string_IOError process_string(String path) {
    Result_string_IOError _res_0 = readFile_string(path);
    if (!_res_0.ok) { return (Result_string_IOError){.ok = false, .error = _res_0.error}; }
    String content = _res_0.value;
    return (Result_string_IOError){.ok = true, .value = content};
}

int main(void) {
    TSC_INIT();
    return 0;
}
