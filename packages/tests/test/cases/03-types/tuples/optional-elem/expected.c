#include "runtime.h"

typedef struct { bool has_value; int32_t value; } opt_i32;
typedef struct { String _0; opt_i32 _1; } Config;

int main(void) {
    TSC_INIT();
    Config a = {._0 = STR_LIT("localhost"), ._1 = {false, 0}};
    Config b = {._0 = STR_LIT("localhost"), ._1 = {true, 8080}};
    printf("%s\n", a._0.data);
    printf("%d\n", b._1.value);
    return 0;
}
