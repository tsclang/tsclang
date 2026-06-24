#include "runtime.h"

String grade_i32(int32_t score) {
    String _match_0 = {0};
    if (score == 10) { _match_0 = STR_LIT("perfect"); }
    else if (score == 5) { _match_0 = STR_LIT("average"); }
    else { _match_0 = STR_LIT("other"); }
    return _match_0;
}

int main(void) {
    TSC_INIT();
    printf("%s\n", grade_i32(10).data);
    printf("%s\n", grade_i32(5).data);
    printf("%s\n", grade_i32(3).data);
    return 0;
}
