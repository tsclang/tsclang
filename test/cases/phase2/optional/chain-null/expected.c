#include "runtime.h"

typedef struct { bool has_value; int32_t value; } opt_i32;
typedef struct { bool has_value; String value; } opt_string;

int main(void) {
    TSC_INIT();
    opt_i32 x = {false, 0};
    opt_string y = x.has_value ? (opt_string){true, tsc_i32_to_string(x.value)} : (opt_string){false, STR_LIT("")};
    printf("%s\n", y.has_value ? y.value.data : "null");
    return 0;
}
