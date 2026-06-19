#include "runtime.h"

int main(void) {
    TSC_INIT();
    opt_string s = {true, STR_LIT("hello")};
    if (s.has_value) {
        printf("%s\n", s.value.data);
        s = (opt_string){false, 0};
    }
    printf("%s\n", s.has_value ? "some" : "null");
    return 0;
}
