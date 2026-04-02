#include "runtime.h"

typedef struct { TscError _base; } IOError;
static IOError IOError_new(String msg) { IOError s = {0}; s._base.message = msg; return s; }

typedef struct { bool ok; union { String value; IOError error; }; } Result_string_IOError;

Result_string_IOError readFile_string(String path) {
    (void)path;
    return (Result_string_IOError){.ok = false, .error = IOError_new(STR_LIT("fail"))};
}

int main(void) {
    TSC_INIT();
    Result_string_IOError _res_0 = readFile_string(STR_LIT("x.txt"));
    if (!_res_0.ok) { tsc_panic(_res_0.error._base.message); }
    String content = _res_0.value;
    printf("%s\n", content.data);
    return 0;
}
