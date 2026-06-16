#include "runtime.h"

typedef struct { TscError _base; } Err;
static Err Err_new(String msg) { Err s = {0}; s._base.message = msg; return s; }

typedef struct { bool ok; union { int _dummy; Err error; }; } Result_void_Err;

Result_void_Err mayFail(void) {
    return (Result_void_Err){.ok = false, .error = Err_new(STR_LIT("fail"))};
}

Result_void_Err process(void) {
    Result_void_Err _result = {0};
    String a = {0};
    a = STR_LIT("outer");
    {
        String b = STR_LIT("inner");
        Result_void_Err _res_0 = mayFail();
        if (!_res_0.ok) {
            tsc_string_release(b);
            _result = (Result_void_Err){.ok = false, .error = _res_0.error};
            goto cleanup;
        }
        tsc_string_release(b);
    }
    printf("%s\n", a.data);
        _result = (Result_void_Err){.ok = true};
        goto cleanup;
    cleanup:
        tsc_string_release(a);
        return _result;
}

int main(void) {
    TSC_INIT();
    Result_void_Err _res_1 = process();
    if (!_res_1.ok) {
        Err e = _res_1.error;
        printf("%s\n", e._base.message.data);
    }
    return 0;
}
