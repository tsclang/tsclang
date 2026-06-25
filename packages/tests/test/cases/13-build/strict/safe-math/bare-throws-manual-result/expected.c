#include "runtime.h"

typedef struct { TscError _base; } IOError;
static IOError IOError_new(String msg) { IOError s = {0}; s._base.message = msg; return s; }

typedef struct { bool ok; union { int32_t value; IOError error; }; } Result_i32_IOError;

Result_i32_IOError risky(void) {
    return (Result_i32_IOError){.ok = false, .error = IOError_new(STR_LIT("fail"))};
}

void caller(void) {
    Result_i32_IOError r = risky();
    if (!r.ok) {
        printf("error\n");
    } else {
        printf("%d\n", r.value);
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
