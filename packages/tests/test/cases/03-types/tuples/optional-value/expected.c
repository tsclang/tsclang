#include "runtime.h"

typedef struct { bool has_value; int32_t value; } opt_i32;
typedef struct { String _0; opt_i32 _1; } Config;

int main(void) {
    TSC_INIT();
    Config b = {._0 = STR_LIT("host"), ._1 = {true, 80}};
    printf("%d\n", b._1.value);
    return 0;
}
