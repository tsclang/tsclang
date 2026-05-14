#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int32_t age = 30;
    String msg = tsc_string_concat(STR_LIT("age: "), tsc_i32_to_string(age));
    printf("%s\n", msg.data);
    tsc_string_release(msg);
    return 0;
}
