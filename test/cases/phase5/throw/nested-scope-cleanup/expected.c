#include "runtime.h"

typedef struct { TscError _base; } Err;
static Err Err_new(String msg) { Err s = {0}; s._base.message = msg; return s; }

typedef struct { bool ok; union { int _dummy; Err error; }; } Result_void_Err;

Result_void_Err mayFail(void) {
    return (Result_void_Err){.ok = false, .error = Err_new(STR_LIT("fail"))};
}

void process(void) {
    String a = STR_LIT("outer");
    {
        String b = STR_LIT("inner");
        mayFail();
        tsc_string_release(b);
    }
    printf("%s\n", a.data);
    tsc_string_release(a);
}

int main(void) {
    TSC_INIT();
    process();
    return 0;
}
