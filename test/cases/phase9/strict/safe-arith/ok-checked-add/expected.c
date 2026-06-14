#include "runtime.h"

typedef struct { bool has_value; int32_t value; } opt_i32;

int main(void) {
    TSC_INIT();
    int32_t a = 2147483640;
    int32_t b = 10;
    opt_i32 _tsc_opt_1 = ({ int32_t _chk_0; __builtin_add_overflow((int32_t)a, (int32_t)b, &_chk_0) ? (opt_i32){.has_value = false} : (opt_i32){.has_value = true, .value = _chk_0}; });
    bool q = _tsc_opt_1.has_value ? _tsc_opt_1.value : 0;
    printf("%s\n", (q) ? "true" : "false");
    return 0;
}
