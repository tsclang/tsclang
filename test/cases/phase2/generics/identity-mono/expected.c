#include "runtime.h"

int32_t identity_i32(int32_t x) {
    return x;
}

String identity_string(String x) {
    return x;
}

int main(void) {
    TSC_INIT();
    printf("%d\n", identity_i32(42));
    printf("%s\n", identity_string(STR_LIT("hi")).data);
    return 0;
}
